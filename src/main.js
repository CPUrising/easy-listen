import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { register, unregisterAll } from "@tauri-apps/plugin-global-shortcut";

const AUDIO_EXT = /\.(mp3|m4a|aac|wav|flac|ogg|opus|wma|webm)$/i;
const EXTENSIONS = ["mp3", "m4a", "aac", "wav", "flac", "ogg", "opus", "wma", "webm"];
const LS_MARKS = "easy-listen:marks";
const LS_SETTINGS = "easy-listen:settings";
const DEFAULT_HINT =
  "快捷键：Ctrl+Alt+Space 播放/暂停，Ctrl+Alt+←/→ 快退/快进 5 秒，Ctrl+Alt+M 标记";

const audio = document.getElementById("audio");
const trackName = document.getElementById("trackName");
const curTime = document.getElementById("curTime");
const durTime = document.getElementById("durTime");
const seek = document.getElementById("seek");
const volume = document.getElementById("volume");
const playBtn = document.getElementById("playBtn");
const markBtn = document.getElementById("markBtn");
const prevMark = document.getElementById("prevMark");
const nextMark = document.getElementById("nextMark");
const marksToggle = document.getElementById("marksToggle");
const marksPanel = document.getElementById("marksPanel");
const marksList = document.getElementById("marksList");
const marksEmpty = document.getElementById("marksEmpty");
const marksClose = document.getElementById("marksClose");
const hint = document.getElementById("hint");
const pinBtn = document.getElementById("pinBtn");

const appWindow = getCurrentWindow();

let currentPath = null;
let marks = [];
let isSeeking = false;
let pinned = true;
let hintTimer = null;

const settings = readJSON(LS_SETTINGS, {});

/* ---------- 工具函数 ---------- */

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn("本地保存失败", err);
  }
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

function basename(path) {
  return path.split(/[\\/]/).pop() || path;
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function showHint(message) {
  hint.textContent = message;
  hint.classList.add("flash");
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    hint.textContent = DEFAULT_HINT;
    hint.classList.remove("flash");
  }, 2600);
}

/* ---------- 打开与播放 ---------- */

async function openFile() {
  try {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "音频文件", extensions: EXTENSIONS }],
    });
    if (typeof selected === "string") {
      loadTrack(selected);
    }
  } catch (err) {
    console.error(err);
    showHint("打开文件失败");
  }
}

function loadTrack(path) {
  if (!AUDIO_EXT.test(path)) {
    showHint("只支持音频文件（mp3 / m4a / wav / flac 等）");
    return;
  }

  currentPath = path;
  audio.src = convertFileSrc(path);
  audio.load();

  const name = basename(path);
  trackName.textContent = name;
  trackName.title = path;
  document.title = name;

  marks = loadMarks(path);
  renderMarks();
  setMarksOpen(false);

  audio.play().then(
    () => showHint(`正在播放：${name}`),
    () => showHint(`已加载：${name}，点击播放开始`)
  );
}

function togglePlay() {
  if (!currentPath) {
    openFile();
    return;
  }
  if (audio.paused) {
    audio.play().catch((err) => {
      console.error(err);
      showHint("播放失败，文件可能已移动或格式不受支持");
    });
  } else {
    audio.pause();
  }
}

function seekBy(delta) {
  if (!currentPath) {
    showHint("请先打开一个音频文件");
    return;
  }
  const duration = audio.duration;
  let target = audio.currentTime + delta;
  if (Number.isFinite(duration)) {
    target = Math.min(target, Math.max(duration - 0.05, 0));
  }
  target = Math.max(target, 0);
  audio.currentTime = target;
  curTime.textContent = formatTime(target);
  showHint(`${delta > 0 ? "前进" : "后退"} ${Math.abs(delta)} 秒 → ${formatTime(target)}`);
}

/* ---------- 标记 ---------- */

function marksKey(path) {
  return path.toLowerCase();
}

function loadMarks(path) {
  const all = readJSON(LS_MARKS, {});
  const list = all[marksKey(path)];
  return Array.isArray(list) ? list.filter((m) => Number.isFinite(m.t)).sort((a, b) => a.t - b.t) : [];
}

function saveMarks() {
  if (!currentPath) return;
  const all = readJSON(LS_MARKS, {});
  all[marksKey(currentPath)] = marks;
  writeJSON(LS_MARKS, all);
}

function addMark() {
  if (!currentPath) {
    showHint("请先打开一个音频文件");
    return;
  }
  if (!Number.isFinite(audio.duration)) {
    showHint("音频还没加载好，稍后再试");
    return;
  }
  const t = audio.currentTime;
  if (marks.some((m) => Math.abs(m.t - t) < 1)) {
    showHint("当前位置附近已经有标记了");
    return;
  }
  marks.push({ id: newId(), t });
  marks.sort((a, b) => a.t - b.t);
  saveMarks();
  renderMarks();
  showHint(`已在 ${formatTime(t)} 添加标记`);
}

function jumpToNextMark() {
  if (!marks.length) {
    showHint("还没有标记");
    return;
  }
  const now = audio.currentTime;
  const next = marks.find((m) => m.t > now + 0.3);
  if (!next) {
    showHint("后面没有标记了");
    return;
  }
  audio.currentTime = next.t;
  showHint(`跳到标记 ${formatTime(next.t)}`);
}

function jumpToPrevMark() {
  if (!marks.length) {
    showHint("还没有标记");
    return;
  }
  const now = audio.currentTime;
  const prev = [...marks].reverse().find((m) => m.t < now - 0.3);
  if (!prev) {
    showHint("前面没有标记了");
    return;
  }
  audio.currentTime = prev.t;
  showHint(`回到标记 ${formatTime(prev.t)}`);
}

function removeMark(id) {
  marks = marks.filter((m) => m.id !== id);
  saveMarks();
  renderMarks();
}

function renderMarks() {
  marksToggle.textContent = `标记 ${marks.length} ${marksPanel.classList.contains("hidden") ? "▾" : "▴"}`;
  marksEmpty.classList.toggle("hidden", marks.length > 0);
  marksList.replaceChildren();

  for (const mark of marks) {
    const li = document.createElement("li");

    const jump = document.createElement("button");
    jump.className = "mark-jump";
    jump.title = "跳转到该标记";
    const time = document.createElement("span");
    time.className = "mark-time";
    time.textContent = formatTime(mark.t);
    const label = document.createElement("span");
    label.className = "mark-label";
    label.textContent = "点击跳转";
    jump.append(time, label);
    jump.addEventListener("click", () => {
      audio.currentTime = mark.t;
      showHint(`跳到 ${formatTime(mark.t)}`);
    });

    const del = document.createElement("button");
    del.className = "mark-del";
    del.title = "删除该标记";
    del.textContent = "×";
    del.addEventListener("click", () => removeMark(mark.id));

    li.append(jump, del);
    marksList.append(li);
  }
}

function setMarksOpen(open) {
  marksPanel.classList.toggle("hidden", !open);
  marksToggle.textContent = `标记 ${marks.length} ${open ? "▴" : "▾"}`;
}

/* ---------- 窗口与设置 ---------- */

function saveSettings() {
  settings.volume = Number(volume.value);
  settings.pinned = pinned;
  writeJSON(LS_SETTINGS, settings);
}

async function applyPinState() {
  pinBtn.classList.toggle("active", pinned);
  pinBtn.title = pinned ? "取消置顶" : "置顶";
  try {
    await appWindow.setAlwaysOnTop(pinned);
  } catch (err) {
    console.warn("设置置顶失败", err);
  }
  saveSettings();
}

async function setupGlobalHotkeys() {
  const bindings = [
    ["Control+Alt+Space", togglePlay],
    ["Control+Alt+ArrowLeft", () => seekBy(-5)],
    ["Control+Alt+ArrowRight", () => seekBy(5)],
    ["Control+Alt+M", addMark],
  ];
  for (const [accelerator, handler] of bindings) {
    try {
      await register(accelerator, handler);
    } catch (err) {
      console.warn(`注册全局快捷键失败：${accelerator}`, err);
    }
  }
}

/* ---------- 事件绑定 ---------- */

document.getElementById("openBtn").addEventListener("click", openFile);
document.getElementById("minBtn").addEventListener("click", () => appWindow.minimize());
document.getElementById("closeBtn").addEventListener("click", () => appWindow.close());
pinBtn.addEventListener("click", () => {
  pinned = !pinned;
  applyPinState();
});

playBtn.addEventListener("click", togglePlay);

document.querySelectorAll(".skip").forEach((btn) => {
  btn.addEventListener("click", () => seekBy(Number(btn.dataset.delta)));
});

seek.addEventListener("pointerdown", () => {
  isSeeking = true;
});
window.addEventListener("pointerup", () => {
  isSeeking = false;
});
seek.addEventListener("input", () => {
  if (!Number.isFinite(audio.duration)) return;
  const t = (Number(seek.value) / 100) * audio.duration;
  audio.currentTime = t;
  curTime.textContent = formatTime(t);
});

volume.addEventListener("input", () => {
  audio.volume = Number(volume.value) / 100;
  saveSettings();
});

markBtn.addEventListener("click", addMark);
prevMark.addEventListener("click", jumpToPrevMark);
nextMark.addEventListener("click", jumpToNextMark);
marksToggle.addEventListener("click", () => setMarksOpen(marksPanel.classList.contains("hidden")));
marksClose.addEventListener("click", () => setMarksOpen(false));

audio.addEventListener("timeupdate", () => {
  curTime.textContent = formatTime(audio.currentTime);
  if (!isSeeking && Number.isFinite(audio.duration) && audio.duration > 0) {
    seek.value = String((audio.currentTime / audio.duration) * 100);
  }
});

audio.addEventListener("loadedmetadata", () => {
  durTime.textContent = formatTime(audio.duration);
  seek.value = "0";
});

audio.addEventListener("play", () => {
  playBtn.textContent = "⏸";
});

audio.addEventListener("pause", () => {
  playBtn.textContent = "▶";
});

audio.addEventListener("ended", () => {
  playBtn.textContent = "▶";
  showHint("播放结束");
});

audio.addEventListener("error", () => {
  if (!currentPath) return;
  console.error("音频加载失败", audio.error);
  showHint("无法播放该文件：格式不受支持或文件不可访问");
});

window.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement) return;
  if (event.code === "Space") {
    event.preventDefault();
    togglePlay();
  } else if (event.code === "ArrowLeft") {
    event.preventDefault();
    seekBy(-5);
  } else if (event.code === "ArrowRight") {
    event.preventDefault();
    seekBy(5);
  } else if (event.key.toLowerCase() === "m") {
    event.preventDefault();
    addMark();
  }
});

getCurrentWebview()
  .onDragDropEvent((event) => {
    if (event.payload.type === "enter" || event.payload.type === "over") {
      document.body.classList.add("drag-over");
    } else if (event.payload.type === "drop") {
      document.body.classList.remove("drag-over");
      const path = event.payload.paths?.[0];
      if (path) loadTrack(path);
    } else if (event.payload.type === "leave") {
      document.body.classList.remove("drag-over");
    }
  })
  .catch((err) => console.warn("拖拽监听不可用", err));

window.addEventListener("beforeunload", () => {
  unregisterAll().catch(() => {});
});

/* ---------- 初始化 ---------- */

volume.value = String(Number.isFinite(settings.volume) ? settings.volume : 80);
audio.volume = Number(volume.value) / 100;
pinned = settings.pinned !== false;
applyPinState();
renderMarks();
setupGlobalHotkeys();
