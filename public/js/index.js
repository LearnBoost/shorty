window.onload = function () {
  var el = document.getElementById('count');
  io.connect('/main')
    .on('total', function (total) {
      el.innerHTML = total;
      $(el).animation('fade');
    })
};
