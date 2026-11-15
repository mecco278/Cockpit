# 共享界面与浏览器预览

`prototype/` 是 Cockpit Windows 版和浏览器开发预览共用的界面。目录名沿用项目原有结构。

## 开发预览

在 Windows 上双击仓库根目录的 `启动原型.cmd`，或安装 Node.js 后在根目录运行以下命令，再访问 <http://127.0.0.1:4317>。

```powershell
npm start --prefix prototype
```

浏览器预览使用当前浏览器的本地存储，Windows 便携版使用独立的 SQLite 工作空间。可以通过导出 JSON 和桌面版的「数据与备份」手动迁移。

## 代码入口

| 文件 | 用途 |
| --- | --- |
| `index.html`、`app.js`、`views-v3.js` | 页面入口、交互和视图 |
| `model.js`、`dates.js`、`graph.js` | 工作空间模型、日期、行动树布局 |
| `workspace.js` | 空白工作空间和通用状态定义 |
| `desktop-repository.js` | 桌面数据桥接 |
| `server.mjs`、`service-worker.js` | 开发服务器、浏览器预览缓存 |

回归测试的虚构数据位于 `tests/fixtures/`，由测试脚本显式加载。

```powershell
npm test --prefix prototype
```
