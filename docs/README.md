# 图提取 ImageGrab 官网使用说明

## 本地预览

1. 在资源管理器中进入 `ImageGrab/docs`。
2. 双击 `index.html`，使用浏览器打开。
3. 检查导航、画廊勾选/反选、手机菜单和下载按钮。
4. ZIP 下载地址是相对路径 `downloads/imagegrab.zip`。

页面无需安装依赖、Node.js 或后端，也不依赖外部图片和字体。画廊是内联 SVG / CSS 界面示意，不代表真实电商平台测试结果。示意画廊的“下载选中”只显示解释；真正的安装包下载入口为页面上的“下载插件”和“下载插件 ZIP”。

## 修改页面

- 主色、间距、圆角等变量在 `css/style.css` 顶部 `:root` 中。
- 产品文案和区块内容在 `index.html`。
- 导航、动画、复制地址和画廊示意交互在 `js/main.js`。
- 图标是 `assets/logo.svg`，商品示意与其他图标在 HTML 中。
- 远程仓库尚未创建，所以本地页面不显示虚构的 GitHub 链接。项目站点发布到 `用户名.github.io/仓库名/` 后会自动显示对应仓库入口。

## 下载包

`downloads/imagegrab.zip` 是此版本的插件快照。解压后根目录直接包含 `manifest.json`，应在 Chrome 的 `chrome://extensions` 中开启开发者模式，再选择“加载已解压的扩展程序”。

插件源文件位于项目根目录，修改后应重新打包。包内只需：

- `manifest.json`
- `content.js`、`content.css`
- `background.js`
- `gallery.html`、`gallery.js`、`gallery.css`
- `README.md`、`INSTALL.md`（安装说明）

不要把 `.git`、`docs` 或实际下载的商品图加入安装包。项目 `.gitignore` 已对这个 ZIP 设置例外，后续提交时应确认它也已上传。

## GitHub Pages 发布（当前未执行）

1. 将整个 ImageGrab 项目推送到你自己的 GitHub 仓库，保留根目录的扩展文件与 `docs`。
2. 进入仓库 **Settings → Pages**。
3. Source 选择 **Deploy from a branch**。
4. 选择实际提交的分支（通常为 `main`），文件夹选择 **/docs**，保存。
5. 等待 Pages 部署完成，使用 GitHub 显示的真实网站链接访问。
6. 再测试一次公开页面的安装包下载链接。

所有站内资源和下载包使用相对路径，可用于仓库子路径部署；无需另行购买域名。

## 对应本次作业

- 第03项：真实插件运行截图，例如提取结果、勾选和下载反馈。不要用官网示意图替代。
- 第04项：GitHub 仓库截图，包含账号/仓库名、文件列表及提交。
- 第05项：发布成功后的实际 Pages 官网地址。
- 第06项：实际 Pages 地址下的官网截图，保留地址栏。本地预览不能代替发布截图。

当前完成的是本地官网制作与打包；没有自动创建远程仓库、提交、推送或发布。
