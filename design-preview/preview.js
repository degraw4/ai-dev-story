// Interface study: fixed illustrative state, no financial simulation or save game.
(() => {
  const descriptions = {
    avery: ['Avery Loop', '当前项目已经完成。新项目立项后，可以安排他参与 AI 编程项目。', '“下一款，咱们冲哪张榜？”'],
    wang: ['Alex Weng', '正在筹备 Next-4 发布。项目已完成，正式上榜还差一场发布会。', '“技术报告给我一行，标题我能写三行。”'],
    tim: ['Tim Detmer', '项目训练已经结束，算力已释放。他还想再压缩一点下次的预算。', '“不是显存不够，是精度还没降够。”'],
    ordinary: ['Jules Page', '已完成本款模型的协作研发，正在等待下一个项目。', '“答题完成，下载按钮谁来做？”'],
  };
  document.querySelectorAll('[data-staff]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-staff]').forEach(item => item.classList.toggle('selected', item === button));
    const [name, description, line] = descriptions[button.dataset.staff];
    const detail = document.getElementById('staff-detail');
    detail.replaceChildren();
    const strong = document.createElement('strong'); strong.textContent = name;
    detail.append(strong, document.createTextNode(' ' + description));
    document.getElementById('scene-callout').textContent = line;
  }));
  document.querySelectorAll('[data-panel]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-panel]').forEach(item => item.classList.toggle('active', item === button));
    document.querySelectorAll('.workspace').forEach(panel => panel.classList.toggle('hidden', panel.id !== 'panel-' + button.dataset.panel));
  }));
  const music = document.getElementById('office-music');
  const jingle = document.getElementById('release-sound');
  const musicButton = document.getElementById('music-toggle');
  const volume = document.getElementById('volume');
  let audioEnabled = false;
  let toastTimeout;
  function toast(message) {
    const element = document.getElementById('toast');
    element.textContent = message; element.classList.add('visible');
    clearTimeout(toastTimeout); toastTimeout = setTimeout(() => element.classList.remove('visible'), 2600);
  }
  function setMusicButton() {
    musicButton.setAttribute('aria-pressed', String(audioEnabled));
    musicButton.textContent = audioEnabled ? '♫ 音乐开启' : '♫ 音乐关闭';
  }
  try { const savedVolume = localStorage.getItem('ai-dev-story-design-volume'); if (savedVolume !== null) volume.value = savedVolume; } catch {}
  music.volume = Number(volume.value); jingle.volume = Number(volume.value);
  musicButton.addEventListener('click', async () => {
    if (audioEnabled) { audioEnabled = false; music.pause(); jingle.pause(); setMusicButton(); return; }
    try { await music.play(); audioEnabled = true; setMusicButton(); }
    catch { toast('音频暂未加载成功，可打开 WAV 文件试听。'); }
  });
  volume.addEventListener('input', () => {
    music.volume = Number(volume.value); jingle.volume = Number(volume.value);
    try { localStorage.setItem('ai-dev-story-design-volume', volume.value); } catch {}
  });
  document.getElementById('open-release').addEventListener('click', () => {
    document.getElementById('release-dialog').showModal();
    if (audioEnabled) {
      music.volume = Number(volume.value) * .25;
      jingle.currentTime = 0;
      jingle.play().catch(() => { music.volume = Number(volume.value); });
    }
  });
  jingle.addEventListener('ended', () => { music.volume = Number(volume.value); });
  document.getElementById('view-report').addEventListener('click', () => {
    document.getElementById('release-dialog').close();
    document.getElementById('report-dialog').showModal();
  });
  document.getElementById('open-ending').addEventListener('click', () => document.getElementById('ending-dialog').showModal());
  const endingCopy = {
    crown: ['★', '榜单常青树', '你们守住了第一。下一次评测，已经排上日历。', '用户留言：请问怎么把之前上传的文件下载回来？'],
    capital: ['$', '融资永动机', '这一代还在追赶。下一代已经有了预算。', '用户留言：未来版本能打开我今天的文件吗？'],
    ordinary: ['↗', '明年一定第一', '公司还在，模型还在更新。第一名仍然是个具体目标。', '用户留言：我先等等下个版本。'],
    failure: ['…', '发布会照常', '经营结束。宣传片还剩二十秒。', '用户留言：客服今天在线吗？'],
  };
  document.querySelectorAll('[data-ending]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-ending]').forEach(item => item.classList.toggle('selected', item === button));
    const copy = endingCopy[button.dataset.ending];
    ['ending-symbol', 'ending-title', 'ending-line', 'ending-comment'].forEach((id, index) => { document.getElementById(id).textContent = copy[index]; });
  }));
  document.getElementById('open-hiring').addEventListener('click', () => document.getElementById('hiring-dialog').showModal());
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('close', () => {
    jingle.pause(); music.volume = Number(volume.value);
  }));
  document.getElementById('reply-feedback').addEventListener('click', event => {
    event.currentTarget.textContent = '已标记：下个版本处理 ✓';
    toast('记录已更新。这个回复还没有让模型变好。');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      music.pause(); jingle.pause(); music.volume = Number(volume.value);
    } else if (audioEnabled) {
      music.volume = Number(volume.value);
      music.play().catch(() => { audioEnabled = false; setMusicButton(); });
    }
  });
})();
