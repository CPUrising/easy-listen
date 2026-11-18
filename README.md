# Easy Listen

一个用于「边阅读边听」的 Windows 桌面悬浮音频播放器。基于 Tauri 2 + 原生 Web 前端，体积小、启动快，始终置顶且不干扰阅读软件。

## 功能

- **单文件专注播放**：通过文件对话框或拖拽加载一个音频，不扫描音乐库，不会和一堆音乐混淆
- **精确跳转**：`-30 / -10 / -5 / +5 / +10 / +30` 秒按钮，配合进度条拖动
- **位置标记**：一键标记当前位置，标记列表点击跳转，支持「上一个 / 下一个」标记，按音频文件独立保存
- **悬浮小窗**：无边框、默认置顶（可取消），拖动标题栏即可移动
- **全局快捷键**：焦点停留在阅读软件上时也能控制播放

## 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl + Alt + Space` | 播放 / 暂停 |
| `Ctrl + Alt + ←` | 后退 5 秒 |
| `Ctrl + Alt + →` | 前进 5 秒 |
| `Ctrl + Alt + M` | 标记当前位置 |

窗口获得焦点时，也支持 `Space`、`← / →`、`M`。

## 支持格式

`mp3`、`m4a`、`aac`、`wav`、`flac`、`ogg`、`opus`、`wma`、`webm`（取决于系统 WebView2 的解码能力，mp3/m4a/wav/flac 最稳妥）。

## 开发

环境要求：

- Node.js 20+
- Rust（MSVC 工具链）
- Microsoft Visual Studio C++ Build Tools
- WebView2 Runtime（Windows 10/11 通常已内置）

```powershell
npm install
npm run tauri dev
```

> 如果系统代理指向失效地址导致 cargo 拉取依赖失败，可临时绕过：
>
> ```powershell
> $env:NO_PROXY='*'; npm run tauri dev
> ```

## 打包

```powershell
$env:NO_PROXY='*'; npm run tauri build
```

产物位置：

- 免安装程序：`src-tauri/target/release/easy-listen.exe`
- 安装包：`src-tauri/target/release/bundle/nsis/Easy Listen_0.1.0_x64-setup.exe`

## 目录结构

```
easy-listen/
├─ index.html              # 界面结构
├─ src/
│  ├─ main.js              # 播放、标记、快捷键等逻辑
│  └─ style.css            # 悬浮窗样式
├─ src-tauri/
│  ├─ src/                 # Rust 入口与插件注册
│  ├─ capabilities/        # Tauri 权限配置
│  ├─ icons/               # 应用图标
│  └─ tauri.conf.json      # 窗口、打包与资源协议配置
└─ 需求.txt                # 原始需求记录
```

## 数据存储

音量、置顶状态和标记数据保存在应用 WebView 的 `localStorage` 中，按音频文件的完整路径区分，重新打开同一音频即可看到之前的标记。
