
/* Based on Tantek Çelik's NewBase60.
 *     http://tantek.com/
 *     http://tantek.pbworks.com/NewBase60
 *
 * Released under CC BY-SA 3.0 http://creativecommons.org/licenses/by-sa/3.0/
 */

/**
 * Module exports.
 */

exports.toString = toString;
exports.toNumber = toNumber;

/**
 * Converts a number to base60 str
 *
 * @param {Number} number to convert
 * @api public
 */

function toString (number) {
  var str = ""
    , chars = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ_abcdefghijkmnopqrstuvwxyz"

  if (undefined === number || 0 === number) return 0;

  while (number > 0) {
    var d = number % 60;
    str = chars[d] + str;
    number = (number - d) / 60;
  }

  return str;
}

/**
 * Converts a base60 string to number
 *
 * @api {String} str
 * @api public
 */

function toNumber (str) {
  var number = 0;

  for (var i = 0, l = str.length; i < l; i++) {
    var c = str[i].charCodeAt(0);

    if (c >= 48 && c <= 57) c = c - 48;
    else if (c >= 65 && c <= 72) c -= 55;
    else if (c == 73 || c == 108) c = 1;
    else if (c >=74 && c<=78) c -= 56;
    else if (c == 79) c = 0;
    else if (c >= 80 && c <= 90) c -= 57;
    else if (c == 95) c = 34;
    else if (c >= 97 && c <= 107) c -= 62;
    else if (c >= 109 && c <= 122) c -= 63;
    else c = 0;

    number = 60 * number + c;
  }

  return number;
}
