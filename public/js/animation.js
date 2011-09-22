
/**
 * Triggers a CSS3 keyframe-based animation
 *
 * @param {String} animation name
 * @api public
 */

jQuery.fn.animation = function (name, opts, fn) {
  if ('function' == typeof opts) {
    fn = opts;
    opts = {};
  }

  opts = opts || {};
  opts.duration = opts.duration || '1s';
  opts.timing = opts.timing || 'linear';
  opts.reset = undefined === opts.reset ? true : opts.reset;

  $(this)
    .css('webkitAnimationDuration', opts.duration)
    .css('webkitAnimationTiming', opts.timing)
    .css('webkitAnimationName', name)
    .one('webkitAnimationEnd', function () {
      if (opts.reset) {
        $(this)
          .css('webkitAnimationName', '')
          .css('webkitAnimationDuration', '')
          .css('webkitAnimationTiming', '')
      }
      fn && fn();
    });

  return $(this);
};
