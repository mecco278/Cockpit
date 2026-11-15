# 项目协作说明

- 设计或开发前阅读 `PROJECT_PRINCIPLES.md`，并以当前用户需求为准。
- `prototype/` 是 Windows 版和开发预览共用的界面与业务代码；`desktop/` 承载 Electron、SQLite 与打包逻辑。
- 修改功能时维护备份兼容性，并同步更新相应使用说明。实际发布前验证 Windows 包及固定启动入口。
- 清理发布产物时保留用户工作空间、备份及当前构建依赖。Git 提交仅包含源码、文档与测试源码。
