window.onload = function () {
  function created (short, long, d, manual) {
    var p = $('.creation-stats .stats');
    var t = template('url created', { short: short, url: long, date: d }).prependTo(p);
    if (!manual) t.animation('fade');
  }
  function visited (short, long, d, manual) {
    var p = $('.visited-stats .stats');
    var t = template('url visited', { short: short, url: long, date: d }).prependTo(p);
    if (!manual) t.animation('fade');
  }

  io.connect('/stats')
    .on('url created', created)
    .on('url visited', visited)

  for (var i = 0, l = transactions.length; i < l; i++) {
    var t = transactions[i];
    if ('url created' == t.type) {
      created(t.short, t.parsed, t.date, true);
    } else {
      visited(t.short, t.parsed, t.date, true);
    }
  }
};
