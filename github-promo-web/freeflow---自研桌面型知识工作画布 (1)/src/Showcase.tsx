import { motion } from "motion/react";
import { Play } from "lucide-react";

const PROMO_VIDEO_BASE = `${String(import.meta.env.BASE_URL || "/").replace(/\/?$/, "/")}videos/`;
const CONTENT_IMPORT_VIDEO_URL = `${PROMO_VIDEO_BASE}content-import-format-retention.mp4`;
const SUSTAINABLE_EDITING_VIDEO_URL = `${PROMO_VIDEO_BASE}sustainable-editing-multi-edit.mp4`;
const WORD_PREVIEW_IMPORT_VIDEO_URL = `${PROMO_VIDEO_BASE}word-preview-import.mp4`;
const MULTI_EXPORT_RESULT_DELIVERY_VIDEO_URL = `${PROMO_VIDEO_BASE}multi-export-result-delivery.mp4`;
const LIGHTWEIGHT_MINDMAP_VIDEO_URL = `${PROMO_VIDEO_BASE}lightweight-mindmap.mp4`;

export const Showcase = () => {
  const demos = [
    {
      title: "内容导入画布演示",
      subtitle: "格式保留",
      description:
        "支持异构数据深度解析，无论是复杂的富文本排版还是精细的代码结构，进入画布的一刻即完成原生对象转化，彻底告别“重拍版”烦恼。",
      color: "bg-blue-600",
      videoSrc: CONTENT_IMPORT_VIDEO_URL
    },
    {
      title: "画布内可持续编辑演示",
      subtitle: "多元编辑",
      description:
        "支持多类型对象深度可编辑，无论是规整的表格、结构化的代码块，还是节点文本与文件卡片，进入画布后均支持直接修改、补充与重写，彻底告别“部分元素无法编辑”的限制。",
      color: "bg-emerald-500",
      videoSrc: SUSTAINABLE_EDITING_VIDEO_URL
    },
    {
      title: "Word预览导入",
      subtitle: "快捷预览",
      description:
        "支持Word深度解析，目前支持Word（Docx）文档进入画布后均可实现原生预览与文件卡形式的整理，彻底告别“跳转外部应用查看”的繁琐。",
      color: "bg-purple-600",
      videoSrc: WORD_PREVIEW_IMPORT_VIDEO_URL
    },
    {
      title: "多元化导出",
      subtitle: "结果落地",
      description:
        "基于FreeFlow的AST抽象语法树全结构解析，无论是层级文本、规整表格、结构化代码块还是复杂数学公式，导出Word、XLSX、Markdown以及图片格式均保持原生排版无损还原，彻底告别“导出格式错乱无法二次复用”的烦恼。",
      color: "bg-amber-500",
      videoSrc: MULTI_EXPORT_RESULT_DELIVERY_VIDEO_URL
    },
    {
      title: "轻量思维导图",
      subtitle: "随心记录",
      description:
        "原生思维导图深度融合支持，与画布内各类元素无缝交融、灵活适配，搭配极简便捷的编辑体验，轻松完成思维脉络梳理与结构化办公需求。",
      color: "bg-rose-500",
      videoSrc: LIGHTWEIGHT_MINDMAP_VIDEO_URL
    }
  ];

  return (
    <section className="overflow-hidden bg-white py-40" id="showcase">
      <div className="max-w-7xl mx-auto px-12">
        <div className="mb-32 flex flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-8 flex items-center gap-3"
          >
            <span className="h-[2px] w-8 bg-brand-accent"></span>
            <span className="text-xs font-black uppercase tracking-[0.3em] text-brand-accent">Product Demonstration</span>
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="max-w-4xl text-5xl font-black tracking-tighter leading-[1.1] text-slate-900 md:text-7xl"
          >
            FreeFlow <br />
            <span className="text-brand-accent italic">产品演示</span>
          </motion.h2>
        </div>

        <div className="space-y-48">
          {demos.map((demo, idx) => (
            <div
              key={idx}
              className={`flex flex-col items-center gap-24 lg:gap-32 ${idx % 2 === 0 ? "lg:flex-row" : "lg:flex-row-reverse"}`}
            >
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                className="w-full lg:w-1/2"
              >
                <div className="group relative aspect-video overflow-hidden rounded-[3rem] border border-slate-100 bg-slate-50 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.08)]">
                  {demo.videoSrc ? (
                    <>
                      <div className="absolute inset-0 bg-slate-950"></div>
                      <video
                        className="absolute inset-0 h-full w-full object-cover"
                        controls
                        playsInline
                        preload="metadata"
                        src={demo.videoSrc}
                      />
                    </>
                  ) : (
                    <>
                      <div className="absolute inset-0 bg-gradient-to-br from-slate-100 to-white"></div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="relative flex flex-col items-center gap-8">
                          <motion.div
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            className={`h-24 w-24 ${demo.color} cursor-pointer rounded-full text-white shadow-2xl shadow-blue-500/20 transition-transform flex items-center justify-center`}
                          >
                            <Play size={32} fill="currentColor" />
                          </motion.div>
                          <span className="translate-y-2 text-xs font-black uppercase tracking-[0.4em] text-slate-300">Play Demo</span>
                        </div>
                      </div>
                    </>
                  )}

                  <div className="absolute left-10 top-8 z-10 flex gap-2.5">
                    <div className="h-3 w-3 rounded-full bg-white/70 backdrop-blur"></div>
                    <div className="h-3 w-3 rounded-full bg-white/70 backdrop-blur"></div>
                    <div className="h-3 w-3 rounded-full bg-white/70 backdrop-blur"></div>
                  </div>

                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: idx % 2 === 0 ? 40 : -40 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="w-full space-y-12 lg:w-1/2"
              >
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <span className={`h-2 w-2 rounded-full ${demo.color}`}></span>
                    <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">{demo.subtitle}</span>
                  </div>
                  <h3 className="text-4xl font-black tracking-tight leading-tight text-slate-900 md:text-5xl">
                    {demo.title}
                  </h3>
                </div>

                <p className="max-w-xl text-xl font-bold leading-relaxed text-slate-500 opacity-80">
                  {demo.description}
                </p>
              </motion.div>
            </div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="mt-28 flex justify-center text-center"
        >
          <p className="max-w-3xl text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
            更多功能敬请探索...
          </p>
        </motion.div>
      </div>
    </section>
  );
};
