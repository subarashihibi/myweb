/* ==========================================================================
   站点数据 —— 新增文章时，唯一需要手工维护的文件
   --------------------------------------------------------------------------
   1) 复制 posts/_template.html 为新文件（文件名即网址，如 posts/hume-causation.html）
   2) 修改该文件 <head> 中的 <title> 与 <meta name="description">
   3) 修改正文与文末的「上下篇 / 相关篇目」链接
   4) 在下面 SITE.posts 列表的【最前面】加入一条记录
   5) 首页「近期」、归档、主题页、相关篇目会自动更新，无需其他改动
   ========================================================================== */

const SITE = {
  title: "Rosa's Cafe",
  titleLatin: "",   // 站名已是英文，此字段留空即可
  tagline: "",   // 留空则页头不再显示副标题；想恢复就填回文字
  description: "一个朴素的西方哲学写作园地：从米利都学派到现象学，重述问题，而非复述结论。",
  author: "站长",
  email: "you@example.com",
  language: "zh-CN",
  startYear: 2026,
  copyrightFrom: 2026,

  /* 首页竖排题词及其可收起侧栏已按需求移除（2026-10）；
     若要恢复，需要在 index.html 加回 .sidebar-motto / .sidebar-toggle 结构与对应样式。 */

  /* 背景音乐已移除：assets/music.js、assets/music/ 与页头开关都已删除。
     若以后要恢复：加回音乐脚本 + 在这里恢复 SITE.music 配置 + 页头按钮。 */

  /* 文章索引：越新越靠前 */
  posts: [

    {
      file: "posts/presentism-conflict-myth.html",
      title: "现在主义的扭曲：冲突神话的领地是如何绘制的？",
      date: "2026-11-01",
      category: "哲学",
      tags: ["宗教", "神学", "科学", "自然哲学", "哈里森"],
      summary: "“科学-宗教”的冲突神话，不过是晚近的发明而已。只需考察词源就会明白这一点。",
      words: 3551
    },
    {
      file: "posts/koyre-closed-world-infinite-universe.html",
      title: "无限宇宙与上帝的退场",
      date: "2026-10-27",
      category: "哲学",
      tags: ["科学史", "神学", "柯瓦雷"],
      summary: "从封闭世界到无限宇宙，不是科学把上帝赶出去，而是上帝被请进空间、又被空间留下；无限宇宙继承了神的本体论属性，却把神的位格留在了身后。",
      words: 3745
    },
    {
      file: "posts/crime-and-punishment-polyphony.html",
      title: "浅谈《罪与罚》中的复调小说理论——以信与结尾为对象",
      date: "2026-06-12",
      category: "文艺批评",
      tags: ["陀思妥耶夫斯基", "巴赫金", "复调小说", "俄国文学"],
      summary: "借巴赫金的复调小说理论读《罪与罚》：从母亲那封信里的对话性，到尾声那个「假定性的独白型结尾」为何仍向未来敞开。",
      words: 3409
    },
    {
      file: "posts/kusamakura-landscape.html",
      title: "《草枕》中的风景之发现——论画作的最终形成",
      date: "2026-05-18",
      category: "文艺批评",
      tags: ["日本文学", "哲学", "柄谷行人", "夏目漱石"],
      summary: "借柄谷行人「风景之发现」的理论重读夏目漱石《草枕》：画家为何直到最后一章、在望着那美望着前夫的一刹那间才画得出那幅画。",
      words: 4766
    },
    {
      file: "posts/ancient-greek-philosophy.html",
      title: "古希腊哲学史",
      date: "2026-10-12",
      category: "哲学",
      tags: ["古希腊", "形而上学", "认识论", "伦理学"],
      summary: "以「本原」问题为线索梳理古希腊哲学：从米利都学派的存在论发萌，经智者派与苏格拉底的主体性转向，到希腊化与罗马时期的伦理学与信仰。",
      words: 4430
    },
     {
      file: "posts/what-is-romanticism.html",
      title: "何谓浪漫主义？",
      date: "2026-08-27",
      category: "哲学",
      tags: ["德国", "浪漫主义", "历史"],
      summary: "从启蒙理性到德国民族意识，追索浪漫主义作为「反叛」的根源与代价。",
      words: 2558
    },
    {
      file: "posts/writing-guide.html",
      title: "如何在这里写一篇新文章",
      date: "2026-01-20",
      category: "站点文档",
      tags: ["使用说明", "模板"],
      summary: "从起草到发布的完整流程：目录结构、索引登记、可用样式清单、写作约定与部署方式。",
      words: 1230
    }
  ]
};
