# Cockpit 1.0.1

本次更新为 Windows x64 提供 `.exe` 安装程序。双击安装包即可进入安装向导，可以选择安装目录和是否创建桌面快捷方式。安装完成后可立即启动，也可从开始菜单打开，并在 Windows 设置中卸载。

首次使用从空白工作空间开始。此前用过便携版时，请先退出旧程序，新版会读取 `%LOCALAPPDATA%\Cockpit` 中的现有项目。卸载后，本机工作空间和备份可以在重新安装时继续使用。

## 下载

- [Windows x64 安装程序](https://github.com/mecco278/Cockpit/releases/download/v1.0.1/Cockpit-1.0.1-win-x64-setup.exe)
- [SHA-256 校验文件](https://github.com/mecco278/Cockpit/releases/download/v1.0.1/Cockpit-1.0.1-win-x64-setup.exe.sha256)

安装程序当前未做 Windows 代码签名，系统可能提示无法验证发布者。可对照 SHA-256 文件校验下载内容。

## 发布

运行 `desktop/build-installer.ps1` 生成安装程序和校验文件，将两份文件上传至与对应源码提交关联的 GitHub Release。构建目录、Electron 缓存、工作空间和备份留在 Git 仓库之外。安装程序内附 Electron 和 Chromium 的第三方许可证。[GitHub Releases 文档](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
