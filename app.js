
/**
 * Module dependencies.
 */

var express = require('express')
  , stylus = require('stylus')
  , sio = require('socket.io')
  , fs = require('fs')
  , base60 = require('./base60')
  , url = require('url')
  , nib = require('nib')
  , jadevu = require('jadevu')

/**
 * Determine environment.
 */

var env = process.env.NODE_ENV || 'development';

/**
 * Create db.
 */

redis = require('redis').createClient();

/**
 * App creator.
 */

module.exports = (function (port, secure) {

  /**
   * Create app.
   */

  var app;

  if (secure) {
    app = express.createServer({
        key: read('ssl/' + env + '/key.key')
      , cert: read('ssl/' + env + '/cert.crt')
    });
  } else {
    app = express.createServer();
  }

  /**
   * Basic middleware.
   */

  app.use(express.bodyParser());
  app.use(stylus.middleware({ src: __dirname + '/public/', compile: css }));
  app.use(express.static('public'));

  /**
   * Socket.IO
   */

  var io = sio.listen(app);

  /**
   * Reads a file
   *
   * @api private
   */

  function read (file) {
    return fs.readFileSync(__dirname + '/' + file, 'utf8');
  }

  /**
   * Stylus compiler
   */

  function css (str, path) {
    return stylus(str)
      .set('filename', path)
      .set('compress', true)
      .use(nib())
      .import('nib');
  };

  /**
   * Configure app.
   */

  app.configure(function () {
    app.set('views', __dirname);
    app.set('view engine', 'jade');
    app.set('domain', process.env.SHORTY_DOMAIN || 'lrn.bt');
  });

  /**
   * Development configuration.
   */

  app.configure('development', function () {
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
  });

  /**
   * Production configuration.
   */

  app.configure('production', function () {
    app.use(express.errorHandler());
  });

  /**
   * Index.
   */

  app.get('/', function (req, res, next) {
    redis.hlen('urls', function (err, length) {
      if (err) return next(err);
      res.render('index', { count: length });
    });
  });

  /**
   * Create endpoint.
   */

  var locked = false
    , queue = []

  app.post('/create', validate, exists, function (req, res, next) {
    if (locked) {
      queue.push(req);

      // allow a maximum of 5 seconds for processing
      req.timer = setTimeout(function () {
        queue.splice(queue.indexOf(req), 1);
        res.send(503);
      });

      return;
    } else {
      handle(req);
    }
  });

  /**
   * Checkes that the URL is valid
   */

  function validate (req, res, next) {
    var parsed = req.body.parsed = url.parse(req.body.url);

    if (!req.body.url || !parsed.protocol || !parsed.host) {
      return res.send(400, { error: 'Bad `url` field' });
    }

    next();
  };

  /**
   * Checks that the URL doesnt exist already
   */

  function exists (req, res, next) {
    redis.hget('urls-hash', req.body.url, function (err, val) {
      if (err) return next(err);
      if (val) return res.send({ short: val });
      next();
    });
  }

  /**
   * Handles URL creation
   */

  function handle (req) {
    var url = req.body.url
      , parsed = req.body.parsed

    // locking to ensure atomicity and uniqueness
    locked = true;

    // get count of urls
    redis.hlen('urls', function (err, length) {
      if (err) return req.next(500);

      var short = base60.toString(length ? length + 1 : 0);

      redis.hset('urls', short, url, function (err) {
        if (err) return req.next(err);
        redis.hset('urls-hash', url, short, function (err) {
          if (err) return req.next(err);

          var obj = {
              type: 'url created'
            , url: url
            , short: short
            , date: new Date
          };

          redis.lpush('transactions', JSON.stringify(obj), function (err) {
            if (err) return req.next(500);

            obj.parsed = parsed;
            io.of('/main').volatile.emit('total', length + 1);
            io.of('/stats').volatile.emit('url created', short, parsed, Date.now());
            req.res.send({ short: 'https://' + app.set('domain') + '/' + short });

            // check if there's another link to process
            var next = queue.shift();
            if (next) {
              clearTimeout(next.timer);
              handle(req);
            } else {
              // unlock
              locked = false;
            }
          });
        });
      });
    });
  }

  /**
   * Stats page.
   */

  app.get('/stats', function (req, res, next) {
    redis.lrange('transactions', 0, 100, function (err, vals) {
      if (err) return next(err);
      res.render('stats', { transactions: vals ? vals.map(function (v) {
        v = JSON.parse(v);
        v.parsed = url.parse(v.url);
        delete v.url;
        return v;
      }).reverse() : [] });
    });
  });

  /**
   * Redirection.
   */

  app.get('/:short', function (req, res, next) {
    redis.hget('urls', req.params.short, function (err, val) {
      if (err) return next(err);
      if (!val) return next();

      redis.lpush('transactions', JSON.stringify({
          type: 'url visited'
        , url: val
        , short: req.params.short
        , date: Date.now()
        , ip: req.socket.remoteAddress
        , headers: req.headers
      }), function (err) {
        if (err) console.error(err);
      });

      io.of('/stats').volatile.emit(
          'url visited'
        , req.params.short
        , url.parse(val)
        , Date.now()
      );

      res.redirect(val);
    });
  });

  /**
   * Listen.
   */

  if (!module.parent) {
    app.listen(port, function () {
      var addr = app.address();
      console.error(
          '   app listening on ' + addr.address + ':' + addr.port
        + (secure ? ' (secure) ' : '')
      );
    });

    if (!process.listeners('uncaughtException')) {
      process.on('uncaughtException', function (e) {
        console.error(e && e.stack ? e.stack : e);
      });
    }
  }

  return arguments.callee;
})
('production' == env ? 80 : 3000)
('production' == env ? 443 : 3001, true)
