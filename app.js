
/**
 * Module dependencies.
 */

var express = require('express')
  , stylus = require('stylus')
  , sio = require('socket.io')
  , base60 = require('./base60')
  , jadevu = require('jadevu')
  , url = require('url')
  , nib = require('nib')
  , fs = require('fs')

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

  if ('development' == env)  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(stylus.middleware({ src: __dirname + '/public/', compile: css }));
  app.use(express.static(__dirname + '/public'));

  /**
   * Socket.IO
   */

  var io = sio.listen(app);

  // quiet :)

  io.set('log level', 0);

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
      .set('compress', 'production' == env)
      .use(nib())
      .import('nib');
  };

  /**
   * Configure app.
   */

  app.configure(function () {
    app.set('views', __dirname);
    app.set('view engine', 'jade');
    app.set('domain', process.env.SHORTY_DOMAIN || 'lrn.cc');
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
   * GET index page.
   */

  app.get('/', function (req, res, next) {
    redis.hlen('urls', function (err, length) {
      if (err) return next(err);
      res.render('index', { count: length });
    });
  });

  /**
   * POST a url.
   */

  app.post('/', validate, exists, function (req, res, next) {
    var url = req.body.url
      , parsed = req.body.parsed

    // get count of urls
    redis.hlen('urls', function (err, length) {
      if (err) return next(500);

      var short = base60.toString(length ? length + 1 : 0);

      redis.hset('urls', short, url, function (err) {
        if (err) return next(err);
        redis.hset('urls-hash', url, short, function (err) {
          if (err) return next(err);

          var obj = {
              type: 'url created'
            , url: url
            , short: short
            , date: new Date
          };

          redis.lpush('transactions', JSON.stringify(obj), function (err) {
            if (err) return next(500);

            obj.parsed = parsed;
            io.of('/main').volatile.emit('total', length + 1);
            io.of('/stats').volatile.emit('url created', short, parsed, Date.now());
            res.send({ short: 'https://' + app.set('domain') + '/' + short });
          });
        });
      });
    });
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
   * Content negotiation.
   */

  function accept(type) {
    return function(req, res, next){
      if (req.accepts(type)) return next();
      next('route');
    }
  }

  /**
   * Checks that the URL doesnt exist already
   */

  function exists (req, res, next) {
    redis.hget('urls-hash', req.body.url, function (err, val) {
      if (err) return next(err);
      if (val) return res.send({ short: 'https://' + app.set('domain') + '/' + val });
      next();
    });
  }

  /**
   * GET JSON statistics.
   */

  app.get('/stats', accept('json'), function (req, res, next) {
    redis.lrange('transactions', 0, 100, function (err, vals) {
      if (err) return next(err);
      res.send(vals.map(JSON.parse));
    });
  });

  /**
   * GET statistics.
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
   * GET :short url to perform redirect.
   */

  app.get('/:short', function (req, res, next) {
    redis.hget('urls', req.params.short, function (err, val) {
      if (err) return next(err);
      if (!val) return res.render('404');

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
