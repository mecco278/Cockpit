# Cockpit 1.0.0

2026 年 11 月 15 日 · Windows x64

本次发布包括项目看板与行动树、可自定义的今日工作台、进度记录与周月回顾、思维导图、随手记、日历、全局搜索和本机备份。进度记录可修订，阻碍和导图想法可转为待办，并能从行动详情回看来源。

首次使用时从空白工作空间开始。点击「创建首个项目」建立自己的项目。

## Windows 下载

下载 `Cockpit-1.0.0-win-x64.zip`，完整解压后运行 `Cockpit.exe`。若此前已使用 Cockpit，先退出旧程序；新版本沿用 `%LOCALAPPDATA%\Cockpit` 里的工作空间。便携包未做 Windows 代码签名，下载页可同时提供 SHA-256 校验文件。

## 发布到 GitHub

1. 将源码提交到公开仓库的 `main` 分支。仓库包含源码、文档和自动化测试源码。
2. 以该提交创建标签 `v1.0.0` 和 GitHub Release，发行标题填写 `Cockpit 1.0.0`。
3. 将 `Cockpit-1.0.0-win-x64.zip` 和对应的 `.sha256` 上传为 Release 附件。GitHub 会根据标签自动提供源码归档。

便携包适合作为 Release 附件。构建目录、Electron 缓存、工作空间、备份和测试运行产物都应留在 Git 仓库之外。[GitHub Releases 文档](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)

便携包随附 Electron 和 Chromium 的第三方许可证。Cockpit 源码的授权条款由项目维护者决定。
