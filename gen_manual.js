const fs   = require('fs');
const path = require('path');
const DOCX_PATH = 'C:/Users/jingz/AppData/Roaming/npm/node_modules/docx';
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, PageBreak, LevelFormat,
} = require(DOCX_PATH);

const INK  = '1a1814';
const GOLD = 'b87333';
const WHITE = 'FFFFFF';
const GREY2 = 'E0E0E0';

const cellBorder = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
const allBorders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };

function p(text, opts) {
  opts = opts || {};
  return new Paragraph({
    spacing: { after: 120, before: opts.before || 0 },
    alignment: opts.align || AlignmentType.LEFT,
    children: [new TextRun({
      text: String(text), font: 'Microsoft YaHei', size: opts.size || 22,
      bold: opts.bold || false, color: opts.color || '333333', italics: opts.italic || false,
    })],
  });
}

function blank() {
  return [new Paragraph({ spacing: { after: 60 }, children: [] })];
}

function bullet(text, ref) {
  ref = ref || 'bullets';
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 100 },
    children: [new TextRun({ text: text, font: 'Microsoft YaHei', size: 22, color: '333333' })],
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: GOLD, space: 4 } },
    children: [new TextRun({ text: text, font: 'Microsoft YaHei', size: 34, bold: true, color: INK })],
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 140 },
    children: [new TextRun({ text: text, font: 'Microsoft YaHei', size: 28, bold: true, color: '2c5f8a' })],
  });
}

function qa(q, a) {
  return [
    new Paragraph({
      spacing: { before: 160, after: 60 },
      children: [new TextRun({ text: '问：' + q, font: 'Microsoft YaHei', size: 22, bold: true, color: INK })],
    }),
    new Paragraph({
      spacing: { after: 140 },
      children: [new TextRun({ text: '答：' + a, font: 'Microsoft YaHei', size: 22, color: '555555' })],
    }),
  ];
}

function appendixTable() {
  function hCell(t) {
    return new TableCell({
      borders: allBorders,
      shading: { fill: INK, type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 140, right: 140 },
      width: { size: 3120, type: WidthType.DXA },
      children: [new Paragraph({ alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: t, font: 'Microsoft YaHei', size: 20, bold: true, color: WHITE })] })],
    });
  }
  function dCell(t, even) {
    return new TableCell({
      borders: allBorders,
      shading: { fill: even ? 'F7F4EF' : 'FFFFFF', type: ShadingType.CLEAR },
      margins: { top: 60, bottom: 60, left: 140, right: 140 },
      width: { size: 3120, type: WidthType.DXA },
      children: [new Paragraph({ children: [new TextRun({ text: t, font: 'Microsoft YaHei', size: 20, color: '333333' })] })],
    });
  }
  var rows_data = [
    ['复制文案', '文案结果卡片', '点击正文区域'],
    ['保存到历史', '文案结果卡片', '自动保存，绿色「已保存」'],
    ['重新保存', '文案结果卡片', '点击「重新保存」'],
    ['删除单条', '文案结果卡片', '点击「删除此条」'],
    ['下载文案', '爆文库生成结果', '点击「下载」(.txt 格式)'],
    ['多选导出', '仿写历史记录面板', '点击「多选导出」-> 导出 Excel'],
    ['切换品牌', '各功能页顶部品牌栏', '点击「切换品牌」选择'],
  ];
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [3120, 3120, 3120],
    rows: [new TableRow({ children: [hCell('操作'), hCell('位置'), hCell('方式')] })].concat(
      rows_data.map(function(r, i) {
        return new TableRow({ children: r.map(function(t) { return dCell(t, i % 2 === 0); }) });
      })
    ),
  });
}

// ── 封面 ──
function coverSection() {
  return {
    properties: {
      page: {
        size: { width: 11906, height: 16838 },
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
      },
    },
    children: [
      new Table({
        width: { size: 11906, type: WidthType.DXA },
        columnWidths: [11906],
        rows: [new TableRow({
          children: [new TableCell({
            borders: {
              top:    { style: BorderStyle.NONE, size: 0, color: 'auto' },
              bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
              left:   { style: BorderStyle.NONE, size: 0, color: 'auto' },
              right:  { style: BorderStyle.NONE, size: 0, color: 'auto' },
            },
            shading: { fill: INK, type: ShadingType.CLEAR },
            margins: { top: 4000, bottom: 4000, left: 1440, right: 1440 },
            verticalAlign: VerticalAlign.CENTER,
            width: { size: 11906, type: WidthType.DXA },
            children: [
              new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [
                new TextRun({ text: 'BRAND  CENTER', font: 'Arial', size: 28, color: '666666', characterSpacing: 400 }),
              ]}),
              new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 300 }, children: [
                new TextRun({ text: '系统使用说明书', font: 'Microsoft YaHei', size: 80, bold: true, color: WHITE }),
              ]}),
              new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 800 }, children: [
                new TextRun({ text: '小红书品牌内容创作平台  ·  使用指南', font: 'Microsoft YaHei', size: 26, color: GOLD }),
              ]}),
              new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [
                new TextRun({ text: 'brand.riverline.com.cn', font: 'Courier New', size: 20, color: '555555' }),
              ]}),
            ],
          })],
        })],
      }),
    ],
  };
}

// ── 正文 ──
function bodySection() {
  var c = [];

  // 第一章
  c.push(h1('第一章  系统概述'));
  c.push(p('Brand Center 是一个为小红书品牌内容创作设计的一站式 AI 辅助平台，集品牌档案管理、文案生成、爆文仿写、内容分析和爆文风格学习于一体。'));
  c = c.concat(blank());
  c.push(p('主要功能模块：', { bold: true }));
  c.push(bullet('品牌管理 — 维护品牌档案，统一调性和关键词', 'numbers'));
  c.push(bullet('文案生成 — AI 根据品牌档案生成多风格小红书文案', 'numbers'));
  c.push(bullet('爆文仿写 — 上传参考爆文，AI 仿写同风格文案', 'numbers'));
  c.push(bullet('文案分析 — 对已有文案进行结构诊断和优化建议', 'numbers'));
  c.push(bullet('爆文风格库 — 收藏爆文、AI 分析规律、生成仿写', 'numbers'));
  c.push(bullet('用户管理 — 管理员账号管理（仅管理员可见）', 'numbers'));

  // 第二章
  c.push(new Paragraph({ children: [new PageBreak()] }));
  c.push(h1('第二章  登录与账号'));
  c.push(h2('2.1  登录方式'));
  c.push(p('打开网址 brand.riverline.com.cn，输入账号和密码登录。'));
  c.push(h2('2.2  权限说明'));
  c.push(bullet('普通用户：可使用全部内容创作功能，可查看和操作自己的历史记录'));
  c.push(bullet('管理员：额外拥有用户管理权限，可添加/删除账号'));
  c.push(h2('2.3  退出登录'));
  c.push(p('点击右上角「退出」按钮即可安全退出。'));

  // 第三章
  c.push(new Paragraph({ children: [new PageBreak()] }));
  c.push(h1('第三章  品牌管理'));
  c.push(h2('3.1  功能说明'));
  c.push(p('品牌档案是整个系统的核心基础。填写后，文案生成、爆文仿写等所有模块都会自动读取品牌信息，确保输出内容符合品牌调性。'));
  c.push(h2('3.2  创建品牌档案'));
  c.push(bullet('点击顶部导航「品牌管理」', 'numbers'));
  c.push(bullet('点击「新建品牌」按钮', 'numbers'));
  c.push(bullet('填写以下信息：', 'numbers'));
  c.push(p('       · 品牌名称（必填）'));
  c.push(p('       · 品牌理念 / Slogan'));
  c.push(p('       · 语气风格（如：温柔治愈、专业种草、闺蜜聊天）'));
  c.push(p('       · 目标人群'));
  c.push(p('       · 核心关键词（以逗号分隔）'));
  c.push(p('       · 禁忌词（避免出现的词语，以逗号分隔）'));
  c.push(p('       · 价格区间'));
  c.push(h2('3.3  切换品牌'));
  c.push(p('系统支持多个品牌档案。点击品牌卡片右上角「设为当前品牌」，其他模块会自动切换到对应品牌信息。'));
  c.push(h2('3.4  编辑和删除'));
  c.push(bullet('编辑：点击品牌卡片上的「编辑」按钮修改信息'));
  c.push(bullet('删除：点击「删除」按钮，确认后删除（不可恢复）'));

  // 第四章
  c.push(new Paragraph({ children: [new PageBreak()] }));
  c.push(h1('第四章  文案生成'));
  c.push(h2('4.1  功能说明'));
  c.push(p('根据品牌档案和产品信息，AI 自动生成多个不同风格的小红书文案。'));
  c.push(h2('4.2  使用步骤'));
  c.push(bullet('点击顶部导航「文案生成」', 'numbers'));
  c.push(bullet('如已设置品牌档案，品牌信息会自动填入', 'numbers'));
  c.push(bullet('填写产品信息（产品名称 / 核心卖点 / 目标人群 / 补充要求）', 'numbers'));
  c.push(bullet('点击「生成文案」按钮', 'numbers'));
  c.push(bullet('等待 AI 生成，通常 10–20 秒', 'numbers'));
  c.push(h2('4.3  查看和使用结果'));
  c.push(bullet('生成结果包含多个风格版本'));
  c.push(bullet('点击正文区域可一键复制'));
  c.push(bullet('每个版本底部显示「已保存」，自动保存到历史记录'));

  // 第五章
  c.push(new Paragraph({ children: [new PageBreak()] }));
  c.push(h1('第五章  爆文仿写'));
  c.push(h2('5.1  功能说明'));
  c.push(p('上传一篇小红书爆文（文字或截图），AI 深度学习其语气、节奏、结构，然后为你的产品仿写相同风格的文案。'));
  c.push(h2('5.2  快速仿写模式'));
  c.push(p('适合：想快速复刻爆文风格，不需要详细分析。', { italic: true, color: '666666' }));
  c.push(bullet('点击「爆文仿写」进入快速仿写模式', 'numbers'));
  c.push(bullet('在「参考内容」区域粘贴爆文原文，或上传截图', 'numbers'));
  c.push(bullet('填写产品信息（产品名称 / 核心卖点 / 目标人群）', 'numbers'));
  c.push(bullet('设置文案长度（默认 200 字，范围 50–1000 字）', 'numbers'));
  c.push(bullet('点击「按参考风格生成仿写」', 'numbers'));
  c.push(h2('5.3  深度分析仿写模式'));
  c.push(p('适合：想精准复刻爆文结构，获得更高质量仿写。', { italic: true, color: '666666' }));
  c.push(bullet('切换到「深度分析」标签页', 'numbers'));
  c.push(bullet('粘贴爆文内容', 'numbers'));
  c.push(bullet('点击「深度分析爆文结构」，等待 AI 生成分析报告', 'numbers'));
  c.push(bullet('报告包含：标题钩子、开头结构、正文节奏、结尾 CTA 等', 'numbers'));
  c.push(bullet('确认分析结果后，填写产品信息', 'numbers'));
  c.push(bullet('点击「按爆文结构生成仿写」', 'numbers'));
  c.push(h2('5.4  结果操作'));
  c.push(bullet('点击正文 — 一键复制文案'));
  c.push(bullet('绿色「已保存」— 自动保存到历史记录'));
  c.push(bullet('「重新保存」— 替换旧记录，重新存入'));
  c.push(bullet('「删除此条」— 从历史记录中删除'));
  c.push(bullet('「延续这个风格再写3篇」— 基于当前版本风格继续生成'));
  c.push(h2('5.5  历史记录'));
  c.push(p('页面底部「历史记录」面板展示所有保存的文案，支持：'));
  c.push(bullet('展开/收起查看详情'));
  c.push(bullet('复制单条记录'));
  c.push(bullet('多选导出为 Excel 文件'));
  c.push(bullet('清空历史记录'));

  // 第六章
  c.push(new Paragraph({ children: [new PageBreak()] }));
  c.push(h1('第六章  文案分析'));
  c.push(h2('6.1  功能说明'));
  c.push(p('对已有文案草稿进行 AI 诊断，指出结构问题、给出优化建议，并输出升级版本。'));
  c.push(h2('6.2  使用步骤'));
  c.push(bullet('点击「文案分析」', 'numbers'));
  c.push(bullet('粘贴需要分析的文案内容', 'numbers'));
  c.push(bullet('点击「开始分析」', 'numbers'));
  c.push(p('       查看分析报告，包含：'));
  c.push(p('       · 整体评分与问题诊断'));
  c.push(p('       · 标题 / 开头 / 正文 / 结尾分项分析'));
  c.push(p('       · 具体优化建议'));
  c.push(bullet('可基于分析结果生成优化版本', 'numbers'));

  // 第七章
  c.push(new Paragraph({ children: [new PageBreak()] }));
  c.push(h1('第七章  爆文风格库'));
  c.push(h2('7.1  功能说明'));
  c.push(p('收藏你在小红书发现的优质爆文，AI 自动分析结构规律，积累越多学习效果越好，还可直接根据任意爆文生成仿写文案。'));
  c.push(h2('7.2  添加爆文'));
  c.push(bullet('点击右上角「添加爆文」', 'numbers'));
  c.push(bullet('填写标题/备注名称、爆文完整内容、平台、点赞数、风格标签', 'numbers'));
  c.push(bullet('点击「保存并分析」，系统自动触发 AI 分析', 'numbers'));
  c.push(h2('7.3  查看分析结果'));
  c.push(p('点击任意爆文卡片，弹窗左侧显示原文，右侧显示 AI 分析：'));
  c.push(bullet('开头钩子类型和写法'));
  c.push(bullet('内容结构节奏'));
  c.push(bullet('风格类型标签'));
  c.push(bullet('情绪触发点'));
  c.push(bullet('金句 / 高频词'));
  c.push(bullet('行动引导（CTA）方式'));
  c.push(bullet('Emoji 使用风格'));
  c.push(bullet('爆文原因分析'));
  c.push(bullet('可复用写作模式'));
  c.push(h2('7.4  根据爆文生成仿写'));
  c.push(bullet('在爆文查看弹窗中点击右上角「生成仿写」按钮', 'numbers'));
  c.push(bullet('底部展开生成表单，填写产品信息和文案长度（默认 200 字）', 'numbers'));
  c.push(bullet('点击「生成 3 个仿写版本」', 'numbers'));
  c.push(bullet('每个版本支持：点击复制 / 重新保存 / 删除 / 下载（.txt 文件）', 'numbers'));
  c.push(h2('7.5  综合学习洞察'));
  c.push(p('点击页面顶部「综合学习洞察」面板，基于库中所有已分析爆文自动提炼：'));
  c.push(bullet('最有效开头钩子模式'));
  c.push(bullet('最常见内容结构节奏'));
  c.push(bullet('核心情绪驱动和高频金句'));
  c.push(bullet('可复用写作规律'));
  c.push(bullet('最有效互动引导方式'));
  c.push(h2('7.6  筛选功能'));
  c.push(p('顶部筛选按钮可按风格类型筛选：全部 / 情绪共鸣型 / 干货攻略型 / 故事叙事型 / 种草安利型 / 悬念反转型'));

  // 第八章
  c.push(new Paragraph({ children: [new PageBreak()] }));
  c.push(h1('第八章  用户管理（仅管理员）'));
  c.push(h2('8.1  查看用户列表'));
  c.push(p('点击「用户管理」，查看所有注册账号及其信息。'));
  c.push(h2('8.2  添加新用户'));
  c.push(bullet('点击「添加用户」', 'numbers'));
  c.push(bullet('填写用户名和密码', 'numbers'));
  c.push(bullet('选择权限（普通用户 / 管理员）', 'numbers'));
  c.push(bullet('确认保存', 'numbers'));
  c.push(h2('8.3  删除用户'));
  c.push(p('点击用户列表中的「删除」按钮，确认后删除账号。'));

  // 第九章
  c.push(new Paragraph({ children: [new PageBreak()] }));
  c.push(h1('第九章  常见问题'));
  c = c.concat(qa('生成内容失败，显示「请求失败」？',
    '可能是网络问题，稍等片刻后重试。如多次失败请联系管理员。'));
  c = c.concat(qa('仿写结果显示「未能解析出仿写内容」？',
    'AI 返回格式异常，点击重试即可。若反复出现，可尝试减少参考内容长度。'));
  c = c.concat(qa('文案保存失败，显示「保存失败」？',
    '可能是登录状态已过期，刷新页面重新登录后再试。'));
  c = c.concat(qa('历史记录为空，之前的内容去哪了？',
    '历史记录按用户账号独立存储在服务器，换账号登录不共享历史。'));
  c = c.concat(qa('如何让生成的文案更符合小红书风格？',
    '在品牌档案中填写「语气风格」和「关键词」；在爆文风格库中持续添加和分析爆文，库中爆文越多，系统学习越精准。'));

  // 附录
  c.push(new Paragraph({ children: [new PageBreak()] }));
  c.push(h1('附录  快捷操作汇总'));
  c.push(appendixTable());
  c = c.concat(blank());
  c = c.concat(blank());
  c.push(p('如需技术支持，请联系系统管理员。', { color: '999999', italic: true, align: AlignmentType.CENTER }));

  return {
    properties: {
      page: {
        size: { width: 11906, height: 16838 },
        margin: { top: 1440, right: 1260, bottom: 1440, left: 1260 },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: GOLD } },
          spacing: { after: 80 },
          children: [new TextRun({ text: 'Brand Center  系统使用说明书', font: 'Microsoft YaHei', size: 18, color: '999999' })],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          border: { top: { style: BorderStyle.SINGLE, size: 2, color: GREY2 } },
          spacing: { before: 80 },
          children: [
            new TextRun({ text: '第 ', font: 'Microsoft YaHei', size: 18, color: '999999' }),
            new TextRun({ children: [PageNumber.CURRENT], font: 'Microsoft YaHei', size: 18, color: '999999' }),
            new TextRun({ text: ' 页', font: 'Microsoft YaHei', size: 18, color: '999999' }),
          ],
        })],
      }),
    },
    children: c,
  };
}

// ── 生成文档 ──
var doc = new Document({
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: '•',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 520, hanging: 260 } } },
        }],
      },
      {
        reference: 'numbers',
        levels: [{
          level: 0, format: LevelFormat.DECIMAL, text: '%1.',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 520, hanging: 260 } } },
        }],
      },
    ],
  },
  styles: {
    default: {
      document: { run: { font: 'Microsoft YaHei', size: 22 } },
    },
    paragraphStyles: [
      {
        id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 34, bold: true, font: 'Microsoft YaHei', color: INK },
        paragraph: { spacing: { before: 400, after: 200 }, outlineLevel: 0 },
      },
      {
        id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 28, bold: true, font: 'Microsoft YaHei', color: '2c5f8a' },
        paragraph: { spacing: { before: 280, after: 140 }, outlineLevel: 1 },
      },
    ],
  },
  sections: [coverSection(), bodySection()],
});

Packer.toBuffer(doc).then(function(buf) {
  var outPath = 'C:/Users/jingz/brand-contents/Brand_Center_使用说明书.docx';
  fs.writeFileSync(outPath, buf);
  console.log('✓ 文档已生成：' + outPath);
}).catch(function(e) {
  console.error('生成失败：', e.message);
  process.exit(1);
});
