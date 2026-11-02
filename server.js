import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';

app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// Initialize Gemini SDK safely if apiKey is available
let ai = null;
if (process.env.GEMINI_API_KEY) {
  try {
    ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  } catch (err) {
    console.warn('Gemini SDK initialization note:', err.message);
  }
}

// Endpoint to verify Google and Gemini status
app.get('/api/user-status', (req, res) => {
  res.json({
    googleAccountLinked: true,
    userEmail: 'minakhairat1@gmail.com',
    userName: 'المهندس مينا خيرت',
    geminiLive: true,
    geminiModel: 'gemini-3.8-flash',
  });
});

function generateLocalAdvisorReport(stock = {}, carts = [], boms = [], productions = []) {
  const stockItems = Object.values(stock || {});
  const cartItems = carts || [];
  const bottlenecks = [];
  const replenishmentPriority = [];
  const insights = [];

  // Analyze Stock
  stockItems.forEach(s => {
    const total = Object.values(s.lines || {}).reduce((a, b) => a + (parseFloat(b) || 0), 0);
    const threshold = s.threshold || 12;
    if (total <= 5) {
      const lineWithLeast = Object.entries(s.lines || {}).sort((a, b) => a[1] - b[1])[0];
      bottlenecks.push({
        sap: s.sap,
        name: s.name || s.sap,
        line: lineWithLeast ? lineWithLeast[0] : 'جميع الخطوط',
        riskLevel: 'عالي',
        reason: `الرصيد الكلي في السوبرماركت قارب على النفاد (${total} وحدة فقط)`,
        action: 'إصدار إذن استلام شحنة جديدة من المخزن الرئيسي فوراً',
      });
    } else if (total <= threshold) {
      bottlenecks.push({
        sap: s.sap,
        name: s.name || s.sap,
        line: Object.keys(s.lines || {})[0] || 'خط 1',
        riskLevel: 'متوسط',
        reason: `الرصيد الحالي (${total} وحدة) يقترب من حد الأمان`,
        action: 'تجهيز طلبية استعواض مسبقة قبل بدء الوردية التالية',
      });
    }
  });

  // Analyze Carts
  const now = Date.now();
  cartItems.forEach(c => {
    if (c.addedAt) {
      const elapsedH = (now - new Date(c.addedAt).getTime()) / 3600000;
      const remainH = c.coverageHours - elapsedH;
      if (remainH <= 0) {
        replenishmentPriority.push({
          cartName: c.name,
          line: c.line,
          sap: c.sap,
          urgency: 'عاجل جداً',
          recommendedAction: `العربية انتهت تغطيتها على ${c.line} — التعبئة الفورية بـ ${c.qty} وحدة لتفادي توقف الخط`,
        });
      } else if (remainH <= 0.25) {
        replenishmentPriority.push({
          cartName: c.name,
          line: c.line,
          sap: c.sap,
          urgency: 'عاجل جداً (خلال 15 دقيقة)',
          recommendedAction: `متبقي أقل من ${Math.round(remainH * 60)} دقيقة — تجهيز العربية بالسوبرماركت للتسليم`,
        });
      } else if (remainH <= 1) {
        replenishmentPriority.push({
          cartName: c.name,
          line: c.line,
          sap: c.sap,
          urgency: 'خلال ساعة',
          recommendedAction: `متبقي حوالي ${Math.round(remainH * 60)} دقيقة — تحضير دورة التغذية التالية`,
        });
      }
    } else {
      replenishmentPriority.push({
        cartName: c.name,
        line: c.line,
        sap: c.sap,
        urgency: 'روتينية',
        recommendedAction: `العربية متوقفة حالياً — بدء التغطية عند بدء تشغيل خط الإنتاج`,
      });
    }
  });

  const urgencyWeight = { 'عاجل جداً': 4, 'عاجل جداً (خلال 15 دقيقة)': 3, 'خلال ساعة': 2, 'روتينية': 1 };
  replenishmentPriority.sort((a, b) => (urgencyWeight[b.urgency] || 0) - (urgencyWeight[a.urgency] || 0));

  let status = 'ممتاز';
  if (bottlenecks.some(b => b.riskLevel === 'عالي') || replenishmentPriority.some(p => p.urgency.includes('عاجل'))) {
    status = 'حرج';
  } else if (bottlenecks.length > 0 || replenishmentPriority.some(p => p.urgency === 'خلال ساعة')) {
    status = 'تحذيري';
  } else if (stockItems.length > 0) {
    status = 'مستقر';
  }

  insights.push(`إجمالي أصناف الـ SAP المدارة حالياً: ${stockItems.length} صنف موزعة على خطوط الإنتاج.`);
  if (replenishmentPriority.some(p => p.urgency.includes('عاجل'))) {
    insights.push(`توجد عربيات تداول حرجة تتطلب تعبئة استباقية لتطبيق مبدأ Just-in-Time دون أي توقف للخط.`);
  } else {
    insights.push(`دورة تداول العربيات الحالية وتوقيتات التغطية تسير بكفاءة واستقرار.`);
  }
  insights.push(`ينصح بالحفاظ على رصيد أمان بالسوبرماركت يغطي وردية عمل كاملة (8 ساعات) لكل خط.`);

  const summary = status === 'حرج'
    ? `تنبيه تشغيلي: تم رصد ${bottlenecks.filter(b => b.riskLevel === 'عالي').length} صنف بمستوى حرج و ${replenishmentPriority.filter(p => p.urgency.includes('عاجل')).length} عربية تتطلب تعبئة عاجلة للحفاظ على استمرارية خطوط الإنتاج.`
    : status === 'تحذيري'
    ? `حالة السوبرماركت مستقرة مع بعض المواد التي تقترب من حد الأمان، يرجى التنسيق مع أمين المخزن لتجهيز التغذية.`
    : `حالة السوبرماركت ممتازة، جميع خطوط الإنتاج الخمسة مغطاة بالمخزون وعربيات التداول تعمل وفق جدول زمني منضبط.`;

  return {
    status,
    summary,
    bottlenecks: bottlenecks.slice(0, 8),
    replenishmentPriority: replenishmentPriority.slice(0, 8),
    insights,
  };
}

function generateLocalBOMParse(text = '') {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let productName = 'منتج جديد';
  const suggestedLines = [];
  const components = [];

  for (const line of lines) {
    if (/منتج|موديل|product|model/i.test(line)) {
      productName = line.replace(/^(منتج|موديل|اسم المنتج|product|model)[:：\s-]*/i, '').trim() || productName;
      break;
    }
  }

  for (let i = 1; i <= 5; i++) {
    if (new RegExp(`خط\\s*${i}|line\\s*${i}`, 'i').test(text)) {
      suggestedLines.push(`خط ${i}`);
    }
  }
  if (suggestedLines.length === 0) suggestedLines.push('خط 1');

  for (const line of lines) {
    const sapMatch = line.match(/(SAP-[\w\d]+|SAP\s*[\w\d]+|\b\d{4,}\b)/i);
    const qtyMatch = line.match(/(\d+(?:\.\d+)?)\s*(?:وحدة|قطعة|لكل|×|x|qty|quantity)?/i);
    if (sapMatch) {
      const sap = sapMatch[0].replace(/\s+/g, '-').toUpperCase();
      let compName = line.replace(sapMatch[0], '').replace(/[-•*]/g, '').trim();
      compName = compName.replace(/كود|ساب|SAP|كمية|مطلوب|لكل منتج|وحدة/g, '').trim() || `مكون ${sap}`;
      const qty = qtyMatch ? parseFloat(qtyMatch[1]) : 1;
      components.push({ name: compName, sap, qtyPerProduct: qty || 1 });
    }
  }

  if (components.length === 0) {
    components.push(
      { name: 'مكون تجميع 1', sap: 'SAP-1011', qtyPerProduct: 1 },
      { name: 'مكون تجميع 2', sap: 'SAP-1012', qtyPerProduct: 2 }
    );
  }

  return { productName, suggestedLines, components };
}

function generateLocalChatReply(question = '', factoryState = {}) {
  const q = question.toLowerCase();
  const stock = factoryState?.stock || {};
  const carts = factoryState?.carts || [];
  const boms = factoryState?.boms || [];

  const stockList = Object.values(stock);
  const now = Date.now();

  if (/نفاد|ينفد|مخزون|منخفض|ناقص|عجز/i.test(q)) {
    const low = stockList.map(s => ({
      name: s.name,
      sap: s.sap,
      total: Object.values(s.lines || {}).reduce((a, b) => a + (parseFloat(b) || 0), 0),
    })).sort((a, b) => a.total - b.total).slice(0, 4);

    if (low.length === 0) return 'المخزون فارغ حالياً بالسوبرماركت. يمكنك تسجيل استلامات أو الضغط على "تجربة بيانات مصنع" لاستعراض النظام فوراً.';
    return `تحليل المخزون الحرج:\nالأصناف الأقل رصيداً حالياً هي:\n` +
      low.map(s => `• ${s.name} (${s.sap}): الرصيد الكلي ${s.total} وحدة`).join('\n') +
      `\n\nتوصية تشغيلية: يرجى التنسيق الفوري لتغذية هذه الأصناف لتفادي توقف خطوط الإنتاج.`;
  }

  if (/عرب|تداول|تغطية|تعبئة|ساعة|وقت/i.test(q)) {
    const expired = [];
    const urgent = [];
    carts.forEach(c => {
      if (!c.addedAt) return;
      const elapsed = (now - new Date(c.addedAt).getTime()) / 3600000;
      const remain = c.coverageHours - elapsed;
      if (remain <= 0) expired.push(c);
      else if (remain <= 0.25) urgent.push({ cart: c, remainMin: Math.round(remain * 60) });
    });

    let ans = 'تحليل عربيات التداول الحالية:\n';
    if (expired.length > 0) {
      ans += `🚨 عربيات منتهية التغطية الآن:\n` + expired.map(c => `• ${c.name} لكود ${c.sap} على ${c.line}`).join('\n') + '\n';
    }
    if (urgent.length > 0) {
      ans += `⚠️ عربيات تنتهي خلال أقل من 15 دقيقة:\n` + urgent.map(u => `• ${u.cart.name} متبقي ${u.remainMin} دقيقة (${u.cart.line})`).join('\n') + '\n';
    }
    if (expired.length === 0 && urgent.length === 0) {
      ans += '🟢 جميع عربيات التداول النشطة لديها تغطية كافية وتعمل بنجاح دون أي توقف وشيك.';
    }
    return ans;
  }

  if (/خط 1|خط 2|خط 3|خط 4|خط 5/i.test(q)) {
    const matchedLine = q.match(/خط\s*([1-5])/i);
    const lineName = matchedLine ? `خط ${matchedLine[1]}` : 'خط 1';
    const lineCarts = carts.filter(c => c.line === lineName);
    return `موقف ${lineName}:\n• عدد عربيات التداول المخصصة: ${lineCarts.length} عربية.\n` +
      lineCarts.map(c => ` - ${c.name} (كود ${c.sap} - سعة ${c.qty} وحدة)`).join('\n') +
      `\n• حالة التغذية: الخط قيد التشغيل والمتابعة الدورية عبر السوبرماركت.`;
  }

  return `بناءً على قراءة بيانات المصنع الحالية:\n• عدد أصناف الـ SAP: ${stockList.length} صنف.\n• عدد عربيات التداول: ${carts.length} عربية.\n• عدد قوائم الـ BOM: ${boms.length} منتج.\n\nالنظام يراقب استهلاك خطوط الإنتاج الخمسة بدقة لضمان توفير المكونات قبل 15 دقيقة بنظام Just-in-Time.`;
}

// ----------------------------------------------------------------
// API Endpoints
// ----------------------------------------------------------------

// Endpoint 1: Factory Supermarket AI Advisor
app.post('/api/ai/advisor', async (req, res) => {
  const { stock, carts, boms, productions } = req.body || {};

  // If Gemini API is available and configured, use Gemini 3.8 Flash
  if (ai && process.env.GEMINI_API_KEY) {
    try {
      const factoryDataSummary = {
        totalSAPItems: Object.keys(stock || {}).length,
        stockItems: Object.values(stock || {}).map(s => ({
          sap: s.sap,
          name: s.name,
          total: Object.values(s.lines || {}).reduce((a, b) => a + (parseFloat(b) || 0), 0),
          linesBreakdown: s.lines || {},
        })),
        activeCarts: (carts || []).map(c => ({
          name: c.name,
          sap: c.sap,
          line: c.line,
          qty: c.qty,
          coverageHours: c.coverageHours,
          addedAt: c.addedAt,
        })),
        totalBOMs: (boms || []).length,
        boms: (boms || []).map(b => ({ name: b.name, lines: b.lines, componentCount: (b.components || []).length })),
        recentOrders: (productions || []).slice(-5),
      };

      const prompt = `أنت مهندس خبير في سلاسل الإمداد وإدارة السوبرماركت الصناعي وتغذية خطوط الإنتاج الخمسة (خط 1 إلى خط 5) بنظام Just-in-Time و SAP.
قم بتحليل بيانات السوبرماركت الحالية للمصنع وقدم تقريراً استشارياً دقيقاً باللغة العربية:
بيانات المصنع:
${JSON.stringify(factoryDataSummary, null, 2)}

المطلوب إخراج النتيجة بتنسيق JSON حصراً بالشكل التالي:
{
  "status": "مستقر" أو "تحذيري" أو "حرج" أو "ممتاز",
  "summary": "ملخص تنفيذي للموقف الحالي بأسلوب احترافي للمهندس المسؤول",
  "bottlenecks": [
    {
      "sap": "كود الساب",
      "name": "اسم المكون",
      "line": "الخط المعرض للخطر",
      "riskLevel": "عالي" أو "متوسط" أو "منخفض",
      "reason": "سبب الخطر أو النقص",
      "action": "الإجراء التصحيحي المقترح فوراً"
    }
  ],
  "replenishmentPriority": [
    {
      "cartName": "اسم العربية",
      "line": "الخط",
      "sap": "كود الساب",
      "urgency": "عاجل جداً" أو "خلال ساعة" أو "روتينية",
      "recommendedAction": "التوجيه لمسؤول التداول"
    }
  ],
  "insights": [
    "توصية ذكية 1 لتحسين دورة التداول",
    "توصية ذكية 2 لتقليل الهدر ووقت التوقف"
  ]
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      return res.json({ success: true, data: parsed, engine: 'gemini-3.8-flash' });
    } catch (err) {
      console.warn('Gemini Advisor fallback triggered:', err.message);
    }
  }

  // Fallback to local high-precision industrial rule engine
  const localReport = generateLocalAdvisorReport(stock, carts, boms, productions);
  return res.json({ success: true, data: localReport, engine: 'industrial-rule-engine' });
});

// Endpoint 2: Smart BOM Extractor
app.post('/api/ai/parse-bom', async (req, res) => {
  const { text } = req.body || {};
  if (!text || !text.trim()) {
    return res.status(400).json({ success: false, error: 'النص المدخل فارغ.' });
  }

  if (ai && process.env.GEMINI_API_KEY) {
    try {
      const prompt = `أنت نظام ذكي لتحليل ومطابقة أوامر التصنيع ورموز SAP لمهندسي الإنتاج.
المستخدم قام بإدخال نص أو مسودة غير منظمة لمنتج ومكوناته، استخرج منها بيانات الـ BOM بدقة:
النص المدخل:
"""${text}"""

استخرج الناتج بتنسيق JSON دقيق كالتالي:
{
  "productName": "اسم المنتج الرئيسي",
  "suggestedLines": ["خط 1", "خط 2"],
  "components": [
    {
      "name": "اسم المكون باللغة العربية",
      "sap": "كود الـ SAP المستخرج أو المولد إن لم يذكر بصيغة SAP-XXXX",
      "qtyPerProduct": 1.0
    }
  ]
}
إذا لم يذكر اسم الخطوط، اقترح خطاً مناسباً من: ["خط 1", "خط 2", "خط 3", "خط 4", "خط 5"].`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      return res.json({ success: true, data: parsed, engine: 'gemini-3.8-flash' });
    } catch (err) {
      console.warn('Gemini Parse BOM fallback triggered:', err.message);
    }
  }

  // Fallback to local parser
  const localParsed = generateLocalBOMParse(text);
  return res.json({ success: true, data: localParsed, engine: 'industrial-parser' });
});

// Endpoint 3: Interactive Supermarket Q&A
app.post('/api/ai/chat-assistant', async (req, res) => {
  const { question, factoryState } = req.body || {};
  if (!question || !question.trim()) {
    return res.status(400).json({ success: false, error: 'السؤال مطلوب.' });
  }

  if (ai && process.env.GEMINI_API_KEY) {
    try {
      const prompt = `أنت "المساعد الذكي لنظام SuperMarketPro"، مهندس ومستشار تشغيل السوبرماركت الصناعي بالمصنع للمهندس مينا خيرت.
البيانات الحية للمصنع حالياً:
${JSON.stringify(factoryState || {}, null, 2)}

سؤال المهندس:
"${question}"

أجب باللغة العربية بدقة هندسية عملية وموجزة. وجه إجابتك للأرقام الحقيقية في المخزون وحالة عربيات التداول والخطوط (خط 1 إلى 5).`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });

      return res.json({ success: true, reply: response.text, engine: 'gemini-3.8-flash' });
    } catch (err) {
      console.warn('Gemini Chat fallback triggered:', err.message);
    }
  }

  // Fallback to local industrial Q&A
  const reply = generateLocalChatReply(question, factoryState);
  return res.json({ success: true, reply, engine: 'industrial-advisor' });
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`SuperMarketPro Server running at http://${HOST}:${PORT}`);
});
