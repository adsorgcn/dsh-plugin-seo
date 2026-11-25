# dsh-plugin-seo · SEO 体检

iLang DSH 工具包的官方插件，也能单独用。装上以后，对你的 DeepSeek Harness 说一句：

> SEO 体检（后面跟你的网址）

它就把站抓回来，按 Google Search Central 当天的官方页逐条判六个维度，出一页报告：每条发现写清看到了什么、在哪一页、Google 哪一页怎么说、怎么改。改法清单你点头一条它改一条，只改工作区里的站文件；部署是你做。部署完说一句「SEO 复检」，它对着上次的报告只报变化。

## 怎么装

最短的路：装好 DeepSeek Harness（0.2.1-rc.5 及以上的 0.2.x），侧栏「插件」→「添加插件」填 `dsh-plugin-seo`，装好说一句「SEO 体检」加网址。命令行：`dsh plugin --profile desktop add dsh-plugin-seo`。

装了 iLang DSH 工具包（https://dsh.ilang.guide/ ）的工作区多一份记忆交接，窗口关了进度还在；没装也能走，不用先去装。

## 口令

- 「SEO 体检」加网址：从头做一次。它一次只问你一件事：网址、一句话你是谁、三到五个最想被搜到的词，答了再往下。
- 「SEO 复检」：你部署过了，它重抓重判，只报和上次比变了的。

## 六个维度

1. 技术地基：Googlebot 进不进得来、页面回不回 200、正文在不在 HTML 里、robots、sitemap、canonical。
2. 你是谁：首页、关于页、定价页说的是不是同一个你，标题、描述、Organization 结构化数据对不对得上页面。
3. 站点聚焦：和主业无关的页、蹭热点的页、批量模板页列出来，给你两个处置，不替你删。
4. 页面可读：重要内容是不是文本、结构化数据对不对应可见文字、有没有误挡摘要。
5. 信任与站外：作者、来源、联系方式真不真，已有的付费和合作链接有没有标 nofollow 或 sponsored。
6. 数据：只读你自己从 Search Console 导出的表，没有表就告诉你怎么导。

## 四条边界

- 不抓 Google 结果页：排名和点击只看你自己从 Search Console 导出的表。
- 不批量产页：新页只在你点名时写，一次一页。
- 不做外链：不制造、不购买、不交换、不自动提交，只检查你已有的。
- 不动线上：只改工作区里的站文件，每改一条 commit 一次；部署、DNS、主机、缓存都是你做。

## 判据只认 Google 自己的页

书里不摘抄 Google 的话，只列地址；每次体检开工它先把这些页读一遍，Google 改了以当天的页为准。书里列的 18 个地址：

- https://developers.google.com/search/docs/essentials
- https://developers.google.com/search/docs/essentials/technical
- https://developers.google.com/search/docs/essentials/spam-policies
- https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- https://developers.google.com/search/docs/fundamentals/using-gen-ai-content
- https://developers.google.com/search/docs/fundamentals/seo-starter-guide
- https://developers.google.com/search/docs/appearance/ai-features
- https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data
- https://developers.google.com/search/docs/appearance/structured-data/sd-policies
- https://developers.google.com/search/docs/appearance/structured-data/organization
- https://developers.google.com/search/docs/appearance/title-link
- https://developers.google.com/search/docs/appearance/snippet
- https://developers.google.com/search/docs/crawling-indexing/robots/intro
- https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview
- https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers
- https://support.google.com/webmasters/answer/7576553

行业文章、大会实测、泄露文档、工具厂商的数字，进不了判据；报告里要提也只能放在「非 Google 的建议」一节，标清出处，不排优先级。

## 不承诺排名

Google 自己写了：符合这些要求也不等于就会被抓取、索引或展示。所以报告里只有看到的东西：页数、状态码、你导出的表里的点击和展示；不写预测，不写「会涨多少」，不承诺排名、流量或被 AI 引用。

## 它做了什么

- 注册一个技能 `seo-tijian`：说「SEO 体检」或「SEO 复检」时模型自己加载。
- 注册一个工具 `seo_book`：取随插件带的工程书 DSH-SEO。书比一次工具结果能装的长，所以一次取一段：先看目录，再按段取。
- 书随包带，不联网取书；不收集任何东西，不带你的钥匙，不改你的记忆。插件本身没有任何网络请求；体检时抓的只有你给的站和 Google 的官方页。

## 许可

MIT。随带的那本书 DSH-SEO 同样 MIT。
