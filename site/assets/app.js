(function () {
  var data = window.__PLUGINS__;
  var state = { query: '', category: '', sort: 'recommend', verifiedOnly: false };
  var list = document.getElementById('list');
  if (!list) return;
  var count = document.getElementById('count');
  var chips = Array.prototype.slice.call(document.querySelectorAll('.chip'));

  function haystack(p) {
    return [p.name, p.title, p.summary, p.categoryTitle, p.repoUrl, p.license].join(' ').toLowerCase();
  }
  function score(p, words) {
    var text = haystack(p), total = 0;
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (!w) continue;
      var at = text.indexOf(w);
      if (at === -1) return -1;
      total += p.name.toLowerCase().indexOf(w) === 0 ? 6 : (at < 40 ? 3 : 1);
    }
    return total;
  }
  function filtered() {
    var words = state.query.toLowerCase().split(/[\s,]+/).filter(Boolean);
    var items = data.filter(function (p) {
      if (state.verifiedOnly && !p.verified) return false;
      if (state.category && p.category !== state.category) return false;
      if (words.length && score(p, words) < 0) return false;
      return true;
    });
    items.sort(function (a, b) {
      if (state.sort === 'stars') return (b.stars || 0) - (a.stars || 0);
      if (state.sort === 'updated') return (Date.parse(b.updatedAt || 0) || 0) - (Date.parse(a.updatedAt || 0) || 0);
      if (state.sort === 'downloads') return (b.downloads || 0) - (a.downloads || 0);
      if (state.sort === 'name') return a.name.localeCompare(b.name);
      if (a.reviewed !== b.reviewed) return a.reviewed ? -1 : 1;
      return (b.curationRank || -1) - (a.curationRank || -1);
    });
    return items;
  }
  function fmt(n) { return n === null || n === undefined ? '—' : Number(n).toLocaleString(); }
  function days(p) {
    if (!p.updatedAt) return '—';
    var d = Math.floor((Date.now() - Date.parse(p.updatedAt)) / 86400000);
    if (!isFinite(d)) return '—';
    if (d <= 0) return '今天';
    if (d < 30) return d + ' 天前';
    if (d < 365) return Math.floor(d / 30) + ' 个月前';
    return Math.floor(d / 365) + ' 年前';
  }
  function card(p) {
    var badges = '';
    badges += p.verified
      ? '<span class="badge ok">已核实</span>'
      : '<span class="badge warn">未核实</span>';
    if (p.reviewed) badges += '<span class="badge accent">人工短评</span>';
    badges += '<span class="badge">' + p.categoryTitle + '</span>';
    if (p.risk === 'high') badges += '<span class="badge high">高风险</span>';
    var install = p.install
      ? '<div class="install"><code>' + p.install + '</code><button class="copy" data-copy="' + p.install + '">复制</button></div>'
      : '<div class="install"><code>安装方式见仓库</code></div>';
    var detail = p.hasReview ? 'p/' + p.slug + '.html' : 'p/' + p.slug + '.html';
    return '<div class="card">' +
      '<div><h2><a href="' + detail + '">' + p.title + '</a></h2>' +
      '<div class="pkg">' + p.name + '</div></div>' +
      '<div class="badges">' + badges + '</div>' +
      '<p>' + p.summary + '</p>' +
      '<div class="meta"><span>★ ' + fmt(p.stars) + '</span><span>更新 ' + days(p) + '</span>' +
      (p.downloads === null ? '' : '<span>周下载 ' + fmt(p.downloads) + '</span>') +
      '<span>' + (p.license || '许可未知') + '</span></div>' +
      install +
      '<footer><span>' + (p.version ? 'v' + p.version : '') + '</span>' +
      '<a href="' + detail + '">' + (p.hasReview ? '读短评 →' : '看详情 →') + '</a></footer>' +
    '</div>';
  }
  function render() {
    var items = filtered();
    count.textContent = '共 ' + items.length + ' 个插件' + (state.verifiedOnly ? '（仅已核实）' : '');
    list.innerHTML = items.length ? items.map(card).join('') : '<div class="empty">没找到匹配的插件。试试换个关键词，或取消分类筛选。</div>';
  }
  document.getElementById('q').addEventListener('input', function (e) { state.query = e.target.value; render(); });
  document.getElementById('sort').addEventListener('change', function (e) { state.sort = e.target.value; render(); });
  document.getElementById('verified').addEventListener('change', function (e) { state.verifiedOnly = e.target.checked; render(); });
  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      state.category = state.category === chip.dataset.category ? '' : chip.dataset.category;
      chips.forEach(function (other) { other.setAttribute('aria-pressed', String(other.dataset.category === state.category)); });
      render();
    });
  });
  document.addEventListener('click', function (event) {
    var button = event.target.closest('.copy');
    if (!button) return;
    var value = button.dataset.copy;
    var done = function () { button.textContent = '已复制'; setTimeout(function () { button.textContent = '复制'; }, 1500); };
    if (navigator.clipboard) navigator.clipboard.writeText(value).then(done, function () {});
    else { var area = document.createElement('textarea'); area.value = value; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove(); done(); }
  });
  render();
})();
