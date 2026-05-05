import { motion } from "motion/react";
import { 
  Check,
  List,
  Maximize2, 
  MousePointer2, 
  Layers, 
  Share2, 
  Cpu, 
  Zap, 
  CheckCircle2,
  ArrowRight,
  Menu,
  X,
  Plus,
  Play,
  Type,
  Minus,
  Image,
  Maximize,
  Square,
  FileText,
  LayoutGrid,
  GitGraph,
  Layout,
  ExternalLink,
  MoreHorizontal,
  Search,
  Download,
  Github
} from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import freeflowLogo from "./freeflow-logo.svg";

const RELEASES_URL = "https://github.com/WuXinbo-bo/FreeFlow-WorkBorad/releases";
const DOWNLOAD_URL = `${RELEASES_URL}/latest/download/FreeFlow-Setup-x64.exe`;
const PROMO_DEMO_ASSET_BASE = `${String(import.meta.env.BASE_URL || "/").replace(/\/?$/, "/")}canvas-demo-standalone/`;
const InlineCanvasDemo = lazy(async () => {
  globalThis.__FREEFLOW_DEMO_ASSET_BASE__ = PROMO_DEMO_ASSET_BASE;
  return import("./PromoCanvasDemo.jsx");
});

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav className={`site-navbar fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? "bg-white/90 backdrop-blur-md py-5 shadow-sm border-b border-slate-100" : "bg-transparent py-6"}`}>
      <div className="max-w-7xl mx-auto px-12 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img
            src={freeflowLogo}
            alt="FreeFlow"
            className="h-10 w-auto object-contain"
          />
          <div className="flex items-baseline gap-3">
            <span className="text-xl font-black tracking-tighter text-slate-900 leading-none">
              FreeFlow
            </span>
            <span className="text-sm font-bold tracking-[0.18em] text-slate-400 leading-none">
              无限画布工作台
            </span>
          </div>
        </div>
        
        <div className="hidden md:flex items-center gap-10">
          <a href="#home" className="text-sm font-semibold text-slate-500 hover:text-brand-accent transition-colors">首页</a>
          <a href="#workflow" className="text-sm font-semibold text-slate-500 hover:text-brand-accent transition-colors">特色功能</a>
          <a href="#features" className="text-sm font-semibold text-slate-500 hover:text-brand-accent transition-colors">技术架构</a>
          <a href="#cta-section" className="text-sm font-semibold text-slate-500 hover:text-brand-accent transition-colors">立即体验</a>
          <a
            href={DOWNLOAD_URL}
            target="_blank"
            rel="noreferrer"
            className="bg-brand-accent text-white px-6 py-2.5 rounded-full text-sm font-bold hover:bg-blue-700 transition-all shadow-lg hover:shadow-brand-accent/20"
          >
            立即下载
          </a>
        </div>

        <button className="md:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          {mobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-full left-0 right-0 bg-white border-b border-slate-100 p-8 flex flex-col gap-6 md:hidden shadow-2xl"
        >
          <a href="#home" className="text-lg font-bold" onClick={() => setMobileMenuOpen(false)}>首页</a>
          <a href="#workflow" className="text-lg font-bold" onClick={() => setMobileMenuOpen(false)}>特色功能</a>
          <a href="#features" className="text-lg font-bold" onClick={() => setMobileMenuOpen(false)}>技术架构</a>
          <a href="#cta-section" className="text-lg font-bold" onClick={() => setMobileMenuOpen(false)}>立即体验</a>
          <a
            href={DOWNLOAD_URL}
            target="_blank"
            rel="noreferrer"
            className="bg-brand-accent text-white py-4 rounded-xl font-bold text-center"
          >
            立即下载
          </a>
        </motion.div>
      )}
    </nav>
  );
};

const DemoOverlay = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] bg-transparent">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 h-full w-full p-3 md:p-5">
        <div className="demo-overlay-native relative h-full w-full overflow-hidden rounded-[2rem] border border-slate-200/70 bg-white shadow-[0_40px_120px_-20px_rgba(15,23,42,0.18)]">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-5 top-5 z-20 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/85 px-4 py-2 text-sm font-bold text-slate-500 shadow-lg shadow-slate-950/10 backdrop-blur transition-colors hover:border-slate-300 hover:text-slate-900"
          >
            <X size={16} />
            关闭体验
          </button>
          <Suspense
            fallback={
              <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(126,171,255,0.22),transparent_28%),linear-gradient(180deg,#f7faff,#eef3fb_50%,#f4f7fb)]">
                <div className="rounded-[1.75rem] border border-white/70 bg-white/85 px-8 py-6 text-center shadow-[0_24px_60px_rgba(27,48,99,0.12)] backdrop-blur">
                  <div className="text-base font-black text-slate-900">正在载入 FreeFlow Demo</div>
                  <div className="mt-2 text-sm font-semibold text-slate-400">结构化接入与画布引擎正在初始化</div>
                </div>
              </div>
            }
          >
            <div className="promo-canvas-demo-host h-full w-full">
              <InlineCanvasDemo />
            </div>
          </Suspense>
        </div>
      </div>
    </div>
  );
};

const HeroCard = ({ title, color, delay }: { title: string, color: string, delay: number }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ delay, duration: 0.5 }}
    className="bg-white p-5 rounded-2xl shadow-xl border border-slate-100 w-44 animate-float"
    style={{ animationDelay: `${delay}s` }}
  >
    <div className="flex items-center justify-between mb-4">
      <div className={`w-3 h-3 rounded-full ${color}`}></div>
      <div className="w-10 h-1.5 bg-slate-100 rounded-full"></div>
    </div>
    <div className="h-2 w-full bg-slate-50 rounded mb-2.5"></div>
    <div className="h-2 w-2/3 bg-slate-50 rounded"></div>
    <p className="mt-4 text-[10px] font-black text-slate-300 uppercase tracking-[0.15em]">{title}</p>
  </motion.div>
);

const Hero = () => {
  return (
    <section id="home" className="hero-first-screen relative pt-40 pb-24 lg:pt-32 lg:pb-12 overflow-hidden bg-white">
      {/* 增加容器布局的灵活性，防止左侧挤压 */}
      <div className="hero-frame max-w-7xl mx-auto px-8 md:px-10 xl:px-12 relative z-10 flex flex-col lg:flex-row items-center">
        
        {/* 左侧文案：基于美学调优的排版 */}
        <div className="hero-copy lg:w-1/2 xl:w-[55%] shrink-0 relative z-20 text-left lg:pr-12">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="hero-eyebrow flex items-center gap-4 mb-10 lg:mb-12">
              <span className="h-[2px] w-12 bg-brand-accent"></span>
              <span className="text-sm md:text-base font-black uppercase tracking-[0.5em] text-slate-800">
                FreeFlow · 自由随心
              </span>
            </div>
            
            <h1 className="hero-title text-6xl md:text-7xl lg:text-8xl font-[900] leading-[0.96] tracking-[-0.06em] text-slate-900 mb-10 lg:mb-12">
              内容<span className="text-brand-accent italic drop-shadow-sm">落地</span><br />
              <div className="hero-subline flex items-baseline gap-4 lg:gap-5 mt-2 whitespace-nowrap">
                <span>格式保留</span>
                <span className="hero-subline-accent text-2xl md:text-3xl lg:text-4xl font-[800] text-slate-300 tracking-tighter">& 二次编辑</span>
              </div>
            </h1>

            <div className="hero-summary flex flex-col gap-6 lg:gap-8 mb-12 lg:mb-16">
              <p className="text-base md:text-lg text-slate-400 font-bold leading-relaxed max-w-xl">
                <span className="text-slate-900 bg-slate-50 px-1 rounded">自研桌面型知识工作画布</span> —— 为知识与工作落地而生。
              </p>
              <div className="flex flex-wrap gap-x-10 gap-y-4">
                {['内容承接', '持续编辑', '多端导出'].map(item => (
                  <div key={item} className="flex items-center gap-2.5 group">
                    <div className="w-5 h-5 rounded-full bg-blue-50 flex items-center justify-center group-hover:bg-brand-accent transition-colors">
                      <CheckCircle2 size={12} className="text-brand-accent group-hover:text-white transition-colors" />
                    </div>
                    <span className="text-xs font-black text-slate-400 tracking-widest uppercase">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="hero-actions flex flex-col sm:flex-row gap-5 lg:gap-6">
              <a
                href={DOWNLOAD_URL}
                target="_blank"
                rel="noreferrer"
                className="bg-slate-900 text-white px-10 py-5 rounded-2xl text-lg font-bold hover:bg-slate-800 transition-all shadow-xl hover:-translate-y-1 active:translate-y-0 inline-flex items-center justify-center"
              >
                立即下载桌面版
              </a>
              <a
                href={RELEASES_URL}
                target="_blank"
                rel="noreferrer"
                className="bg-white border border-slate-200 text-slate-600 px-10 py-5 rounded-2xl text-lg font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-3 group"
              >
                <Github size={20} className="group-hover:scale-110 transition-transform" />
                GitHub
              </a>
            </div>
          </motion.div>
        </div>

        {/* 右侧视觉：通过绝对定位实现半遮挡溢出效果，减少对左侧的布局压力 */}
        <div className="hero-stage lg:absolute lg:right-[-12%] lg:w-[58%] w-full relative mt-16 lg:mt-0">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, x: 100 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={{ duration: 1.2, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="relative"
          >
            {/* 模拟器主体 - 移除了红绿灯和网址栏 */}
            <div className="relative aspect-[16/10] bg-white rounded-[2.5rem] shadow-[0_60px_120px_-20px_rgba(15,23,42,0.2)] border border-slate-200/50 overflow-hidden flex flex-col group">
               
               {/* 简化的头部 */}
               <div className="h-16 px-10 flex items-center justify-between bg-white border-b border-slate-100 relative z-30">
                 <div className="flex items-center gap-4">
                    <img
                      src={freeflowLogo}
                      alt="FreeFlow"
                      className="h-7 w-auto object-contain"
                    />
                  </div>

                  {/* 1:1 复刻工具栏 */}
                  <div className="hidden md:flex items-center bg-white border border-slate-200/60 rounded-2xl px-1.5 py-1.5 shadow-sm gap-1">
                    {[
                      { Icon: MousePointer2, sub: "V", active: true },
                      { Icon: Square, sub: "R" },
                      { Icon: Type, sub: "T" },
                      { Icon: FileText, sub: "F" },
                      { Icon: Image, sub: "I" },
                      { Icon: Share2, sub: "N" },
                      { Icon: LayoutGrid, sub: "+" },
                      { Icon: ExternalLink, sub: "P" },
                      { Icon: MoreHorizontal, sub: "" }
                    ].map((item, i) => (
                      <div 
                        key={i} 
                        className={`relative p-2 rounded-xl transition-all flex items-center justify-center ${item.active ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'}`}
                      >
                        <item.Icon size={18} strokeWidth={2.5} />
                        {item.sub && (
                          <div className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-slate-100 rounded-full flex items-center justify-center border border-white shadow-sm">
                            <span className="text-[6px] font-black leading-none text-slate-400">{item.sub}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="hidden md:flex items-center gap-2">
                    <div className="w-9 h-9 rounded-full border border-slate-200/60 bg-white shadow-sm flex items-center justify-center text-blue-500 transition-transform hover:scale-110">
                      <Search size={14} strokeWidth={3} />
                    </div>
                    <div className="w-9 h-9 rounded-full border border-slate-200/60 bg-white shadow-sm flex items-center justify-center text-slate-700 transition-transform hover:scale-110">
                      <Download size={14} strokeWidth={3} />
                    </div>
                  </div>
               </div>

               {/* 主画布内容 */}
               <div className="flex-1 relative bg-[#fcfcfd] p-12 overflow-hidden flex flex-col justify-center">
                  <div className="absolute inset-0 canvas-grid opacity-40"></div>

                  {/* 居中展示的内容块 */}
                  <motion.div 
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.6, duration: 1 }}
                    className="relative mx-auto w-[95%] bg-[#fffde7] border-2 border-[#f0e68c] rounded-[2rem] p-12 shadow-sm flex flex-col gap-10"
                  >
                    <div className="absolute -top-4 left-10 bg-blue-600 text-white font-bold text-[10px] px-3 py-1 rounded-lg shadow-lg">CONTENT_BLOCK</div>
                    
                    <div className="space-y-4">
                      <h3 className="text-4xl font-[900] text-[#5d5423] tracking-tighter leading-none">FreeFlow 画布是什么</h3>
                      <p className="text-lg text-[#7c723d] font-bold leading-relaxed max-w-2xl opacity-80">
                        内容落地、格式保留、二次编辑、文件整理...
                      </p>
                    </div>
                    
                    <div className="flex gap-10">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 bg-blue-500 rounded-sm"></div>
                        <span className="text-xs font-black text-slate-600 tracking-widest uppercase">输入</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 bg-blue-500 rounded-sm"></div>
                        <span className="text-xs font-black text-slate-600 tracking-widest uppercase">输出</span>
                      </div>
                    </div>

                    <div className="absolute -inset-4 border-2 border-dashed border-blue-400/40 rounded-[2.5rem] pointer-events-none"></div>
                  </motion.div>

                  {/* 协作光标动画 */}
                  <motion.div
                    animate={{ 
                      x: [400, 250, 320], 
                      y: [120, 220, 160] 
                    }}
                    transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute top-0 left-0 z-30 pointer-events-none hidden md:block"
                  >
                    <MousePointer2 className="text-blue-600 fill-blue-600 drop-shadow-md py-0.5" size={24} />
                    <div className="ml-5 bg-blue-600 text-white text-[9px] font-black px-2 py-1 rounded-lg shadow-xl shadow-blue-500/30 flex items-center gap-2 whitespace-nowrap">
                      <span className="w-1 h-1 bg-white rounded-full animate-pulse"></span>
                      正在编辑...
                    </div>
                  </motion.div>

                  {/* 状态指示：与右侧工具对齐 */}
                  <div className="absolute bottom-10 right-12 flex items-center gap-4">
                    <div className="bg-white border border-slate-100 rounded-xl px-4 py-3 shadow-[0_8px_20px_-4px_rgba(0,0,0,0.08)] flex items-center gap-3">
                      <span className="text-[10px] font-black text-slate-900 leading-none">125%</span>
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                    </div>
                  </div>
               </div>
            </div>
          </motion.div>
        </div>
      </div>
      
      {/* 装饰性背景 */}
      <div className="absolute top-0 right-0 -z-10 w-2/3 h-full bg-gradient-to-l from-blue-50/40 to-transparent blur-3xl rounded-full translate-x-1/4 pointer-events-none"></div>
    </section>
  );
};

const Features = () => {
  const features = [
    {
      id: "01",
      label: "接入架构",
      title: "结构化内容接入",
      desc: "并非简单的粘贴，而是异构数据解析。支持输入识别、回退策略与渲染编排。"
    },
    {
      id: "02",
      label: "元素架构",
      title: "统一原生系统",
      desc: "文本、表格、代码、公式集成入原生体系。所有环节皆可缩放、搜索与编辑。"
    },
    {
      id: "03",
      label: "协议架构",
      title: "双层复制协议",
      desc: "内部流转优先语义结构，外部复制降级兼容。兼顾画布保真与跨办公应用。"
    },
    {
      id: "04",
      label: "输出架构",
      title: "结构化导出链路",
      desc: "整理即交付。支持 Word、PDF、Markdown 导出，自然衔接正式办公流。"
    }
  ];

  return (
    <section className="py-40 bg-slate-50/50 border-t border-slate-100" id="features">
      <div className="max-w-7xl mx-auto px-12">
        {/* 精简的主题描述 */}
        <div className="flex flex-col lg:flex-row gap-16 mb-32 border-l-4 border-slate-900 pl-10 h-full py-2">
          <div className="lg:w-1/3">
            <h2 className="text-sm font-black text-slate-400 uppercase tracking-[0.5em] mb-4">Core Philosophy</h2>
            <p className="text-4xl font-[900] text-slate-900 leading-tight tracking-tight">FreeFlow</p>
          </div>
          <div className="lg:w-2/3">
            <p className="text-xl md:text-2xl text-slate-500 font-bold leading-relaxed max-w-3xl">
              FreeFlow 以<span className="text-slate-900">自研画布引擎</span>为核心，贯通接入、承接、编辑、输出全链路，构建知识流以及办公闭环。
            </p>
          </div>
        </div>

        {/* 恢复并优化的背板卡片布局 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 xl:gap-10">
          {features.map((f, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="group h-full"
            >
              <div className="flex flex-col gap-6 h-full p-10 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-2xl hover:shadow-blue-500/5 transition-all duration-500 hover:-translate-y-2 relative overflow-hidden">
                {/* 装饰性背景编号 */}
                <div className="absolute top-8 right-10 text-5xl font-[900] text-slate-50 opacity-[0.05] group-hover:text-brand-accent group-hover:opacity-10 transition-all duration-500">
                  {f.id}
                </div>

                <div className="space-y-4">
                  <span className="inline-block text-[10px] font-black text-blue-600 uppercase tracking-widest px-3 py-1 bg-blue-50 rounded-full">
                    {f.label}
                  </span>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight leading-snug">
                    {f.title}
                  </h3>
                </div>
                
                <p className="text-sm text-slate-500 leading-relaxed font-bold opacity-70 mt-auto">
                  {f.desc}
                </p>
                
                {/* 底部装饰线 */}
                <div className="w-12 h-1 bg-slate-100 group-hover:w-24 group-hover:bg-brand-accent transition-all duration-500 rounded-full"></div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

const BrandSocialProof = () => (
  <section className="py-16 bg-white border-y border-slate-50">
    <div className="max-w-7xl mx-auto px-12">
      <div className="flex flex-wrap justify-center items-center gap-6 md:gap-8 lg:gap-10 opacity-30 grayscale hover:opacity-100 transition-opacity">
        {['结构化内容接入', '统一原生系统', '双层复制协议', '结构化导出链路'].map((name, index, arr) => (
          <div key={name} className="flex items-center gap-6 md:gap-8 lg:gap-10">
            <span className="text-sm font-black tracking-[0.2em] whitespace-nowrap">{name}</span>
            {index < arr.length - 1 ? (
              <span
                aria-hidden="true"
                className="text-slate-300 text-xl md:text-2xl leading-none font-light select-none"
              >
                —
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  </section>
);

const TypingCode = ({ text, delay = 0 }: { text: string; delay?: number }) => {
  return (
    <div className="flex mb-1">
      <motion.p
        initial={{ width: 0 }}
        whileInView={{ width: "100%" }}
        viewport={{ once: false }}
        transition={{ 
          duration: 2, 
          delay, 
          ease: "linear",
          repeat: Infinity,
          repeatDelay: 5
        }}
        className="overflow-hidden whitespace-nowrap"
      >
        {text}
        <motion.span
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 0.8, repeat: Infinity }}
          className="inline-block w-0.5 h-3 bg-blue-500 ml-0.5"
        />
      </motion.p>
    </div>
  );
};

const Workflow = () => {
  const workflowPoints = [
    { 
      title: "结构化内容接入", 
      text: "外部文本、网页、Markdown、代码、公式、表格和文件进入画布时，会先经过识别、解析与转译，尽量落为原生对象，而非静态镜像。" 
    },
    { 
      title: "可持续编辑", 
      text: "画布不是展示终点，而是处理中途的工作台。表格、代码块、节点文本与文件卡均可继续编辑、补充与重写。" 
    },
    { 
      title: "复制即办公", 
      text: "单个元素即可直通 Word、Excel 或 PPT。相比整板导出，FreeFlow 强调原子级的内容与格式跨应用无缝衔接。" 
    },
    { 
      title: "本地工作区画布", 
      text: "画布直接映射真实文件夹，实现文件、图片目录与本地路径统一管理，文件卡支持快速双向定位回跳。" 
    },
    { 
      title: "本地预览与整理", 
      text: "本地办公文件在画布中不仅是占位符。Word、PDF 等支持深度预览与整理，让全量资料处理在同一空间完成。" 
    },
    { 
      title: "多元化导出", 
      text: "整理结果支持 Word、PDF、XLSX、Markdown 等多格式输出。强调的是“导出去继续工作”，而非单纯备份。" 
    }
  ];

  return (
    <section id="workflow" className="workflow-section py-44 bg-white relative overflow-hidden">
      <div className="workflow-shell max-w-7xl mx-auto px-12">
        <div className="workflow-stage flex flex-col lg:flex-row items-start gap-24 xl:gap-32">
          
          <div className="w-full lg:w-1/2">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              className="mb-16"
            >
              <div className="flex items-center gap-3 mb-8">
                <span className="w-8 h-[2px] bg-brand-accent"></span>
                <span className="text-xs font-black text-brand-accent uppercase tracking-[0.3em]">Module Ecosystem</span>
              </div>
              <h2 className="text-5xl md:text-7xl font-extrabold mb-10 tracking-tighter leading-[1.1] text-slate-900">
                为知识与工作<span className="text-brand-accent">落地</span>而生。
              </h2>
            </motion.div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-12">
              {workflowPoints.map((point, idx) => (
                <motion.div 
                  key={idx} 
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  whileHover="hover"
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1 }}
                  className="group cursor-default"
                >
                  <div className="space-y-3">
                    <motion.h4 
                      variants={{
                        hover: { scale: 1.05, x: 4 }
                      }}
                      transition={{ type: "spring", stiffness: 400, damping: 25 }}
                      className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2 origin-left"
                    >
                       <span className="w-1.5 h-1.5 rounded-full bg-slate-200 group-hover:bg-brand-accent transition-colors shrink-0"></span>
                       {point.title}
                    </motion.h4>
                    <p className="text-sm text-slate-500 leading-relaxed font-bold opacity-75">{point.text}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="w-full lg:w-1/2 relative min-h-[750px]">
            {/* Individually floating modules - Strictly these 6: Text, Table, Image, Doc, Code, MindMap */}
            <div className="absolute inset-0">
                
                {/* 1. Document Module (Word style) */}
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  whileHover={{ scale: 1.05, zIndex: 10 }}
                  transition={{ duration: 0.5 }}
                  className="absolute top-[0%] left-[0%] w-[46%] bg-white rounded-3xl p-5 shadow-[0_20px_50px_rgba(0,0,0,0.06)] border border-slate-100 flex items-center gap-4 h-24 cursor-default"
                >
                  <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                    <FileText size={20} />
                  </div>
                  <div className="flex-1">
                    <div className="h-2 bg-slate-100 rounded-full w-20 mb-2"></div>
                    <div className="h-1.5 bg-slate-50 rounded-full w-12"></div>
                  </div>
                </motion.div>

                {/* 2. Image Module */}
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  whileHover={{ scale: 1.05, zIndex: 10 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                  className="absolute top-[0%] right-[0%] w-[48%] bg-white rounded-3xl p-4 shadow-[0_20px_50px_rgba(0,0,0,0.06)] border border-slate-100 h-24 flex items-center justify-center cursor-default"
                >
                   <div className="w-full h-full bg-slate-50 rounded-2xl flex items-center justify-center">
                      <Image className="text-slate-200" size={24} />
                   </div>
                </motion.div>

                {/* 3. Text Module (Tall) */}
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  whileHover={{ scale: 1.02, zIndex: 10 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                  className="absolute top-[16%] left-[0%] w-[46%] bg-white rounded-3xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.06)] border border-slate-100 flex flex-col gap-6 cursor-default"
                >
                   <div className="flex items-center justify-between">
                      <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                         <Type size={18} />
                      </div>
                      <div className="w-3 h-3 rounded-full border-2 border-slate-100"></div>
                   </div>
                   <div className="space-y-4">
                      {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className={`h-1.5 bg-slate-100 rounded-full w-full opacity-${100 - i * 12}`}></div>
                      ))}
                   </div>
                   <div className="mt-4 h-44 bg-slate-50/50 rounded-2xl flex items-center justify-center border border-dashed border-slate-100">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-slate-100 animate-pulse"></div>
                        <div className="h-1.5 bg-slate-100 rounded-full w-16"></div>
                        <div className="h-1 bg-slate-50 rounded-full w-10"></div>
                      </div>
                   </div>
                </motion.div>

                {/* 4. Code Block (Typing) */}
                <motion.div 
                   initial={{ opacity: 0, x: 20 }}
                   whileInView={{ opacity: 1, x: 0 }}
                   whileHover={{ scale: 1.05, zIndex: 10 }}
                   transition={{ duration: 0.5, delay: 0.3 }}
                   className="absolute top-[16%] right-[0%] w-[48%] bg-white rounded-3xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.06)] border border-slate-100 flex flex-col gap-4 overflow-hidden cursor-default"
                >
                   <div className="flex gap-1.5 mb-2">
                       {['#ff5f56', '#ffbd2e', '#27c93f'].map(c => (
                         <div key={c} className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c, opacity: 0.4 }}></div>
                       ))}
                   </div>
                   <div className="font-mono text-[11px] leading-tight text-blue-600 font-bold overflow-hidden min-h-[60px]">
                      <TypingCode text="console.log('Success');" />
                      <TypingCode text="const app = FreeFlow();" delay={3} />
                   </div>
                </motion.div>

                {/* 5. Mind Map (Mindmap style) */}
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  whileHover={{ scale: 1.05, zIndex: 10 }}
                  transition={{ duration: 0.5, delay: 0.4 }}
                  className="absolute top-[42%] right-[0%] w-[48%] bg-white rounded-3xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.06)] border border-slate-100 flex flex-col gap-4 h-[240px] cursor-default"
                >
                   <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-2 flex items-center gap-2">
                      <GitGraph size={14} className="text-slate-400" /> Mind Map
                   </div>
                   <div className="relative flex-1 flex items-center justify-center">
                      <div className="absolute inset-0 flex items-center justify-center">
                        {/* Connection Lines (Centered) */}
                        <div className="absolute w-32 h-px bg-slate-100"></div>
                        <div className="absolute h-24 w-px bg-slate-100"></div>
                        
                        {/* Nodes */}
                        <div className="relative w-12 h-12 bg-blue-600 rounded-xl shadow-lg shadow-blue-100 flex items-center justify-center text-white z-10">
                           <div className="w-5 h-5 rounded-full border-2 border-white/30"></div>
                        </div>
                        
                        <div className="absolute top-1/2 -translate-y-1/2 -right-4 w-10 h-3 bg-slate-50 rounded-full border border-slate-100"></div>
                        <div className="absolute top-1/2 -translate-y-1/2 -left-4 w-10 h-3 bg-slate-50 rounded-full border border-slate-100"></div>
                        <div className="absolute left-1/2 -translate-x-1/2 -top-4 w-12 h-3 bg-slate-50 rounded-full border border-slate-100"></div>
                        <div className="absolute left-1/2 -translate-x-1/2 -bottom-4 w-12 h-3 bg-slate-50 rounded-full border border-slate-100"></div>
                      </div>
                   </div>
                </motion.div>

                {/* 6. Table Module (Wide) */}
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  whileHover={{ scale: 1.02, zIndex: 10 }}
                  transition={{ duration: 0.5, delay: 0.5 }}
                  className="absolute bottom-[0%] left-[0%] w-full bg-white rounded-3xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.06)] border border-slate-100 cursor-default"
                >
                   <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                           <Layout size={16} />
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full w-24"></div>
                      </div>
                      <div className="w-10 h-5 bg-slate-50 rounded-full"></div>
                   </div>
                   <div className="grid grid-cols-4 gap-6">
                      {[1, 2, 3, 4].map(i => (
                        <div key={i} className="space-y-3">
                           <div className="h-1.5 bg-slate-100 rounded-full w-full"></div>
                           <div className="h-1.5 bg-slate-50 rounded-full w-3/4"></div>
                           <div className={`h-1.5 bg-slate-50 rounded-full w-1/2 opacity-50 ${i > 2 ? 'hidden' : ''}`}></div>
                        </div>
                      ))}
                   </div>
                </motion.div>

            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

const CTA = ({ onOpenDemo }: { onOpenDemo: () => void }) => (
  <section id="cta-section" className="py-40 bg-slate-50/50 relative overflow-hidden">
    <div className="max-w-7xl mx-auto px-12 relative z-10">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        className="relative bg-white border border-slate-100 rounded-[4rem] p-32 text-center shadow-[0_40px_100px_-20px_rgba(0,0,0,0.04)] overflow-hidden group"
      >
        {/* 精致的背景流动光影 */}
        <motion.div 
          animate={{ 
            x: [0, 50, 0],
            y: [0, -30, 0],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
          className="absolute -top-40 -left-40 w-96 h-96 bg-brand-accent/5 rounded-full blur-[100px]"
        />
        <motion.div 
          animate={{ 
            x: [0, -60, 0],
            y: [0, 40, 0],
          }}
          transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
          className="absolute -bottom-40 -right-40 w-80 h-80 bg-emerald-500/5 rounded-full blur-[80px]"
        />

        {/* 动态玻璃悬浮件 */}
        <motion.div
          animate={{ y: [0, -20, 0], rotate: [0, 5, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-20 left-20 w-32 h-32 bg-white/40 backdrop-blur-xl border border-white/20 rounded-3xl shadow-xl hidden lg:flex items-center justify-center -rotate-6"
        >
          <div className="w-12 h-1 bg-slate-100 rounded-full"></div>
        </motion.div>

        <motion.div
          animate={{ y: [0, 25, 0], rotate: [0, -8, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute bottom-20 right-20 w-40 h-40 bg-white/40 backdrop-blur-xl border border-white/20 rounded-[2.5rem] shadow-xl hidden lg:flex items-center justify-center rotate-12"
        >
          <div className="w-16 h-16 border-4 border-slate-50 rounded-2xl"></div>
        </motion.div>
        
        <div className="relative z-10">
          <motion.div
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
            className="flex flex-col items-center gap-10"
          >
            <motion.div 
              variants={{
                initial: { opacity: 0, scale: 0.8 },
                animate: { opacity: 1, scale: 1 }
              }}
              className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center mb-4 relative"
            >
              <img
                src={freeflowLogo}
                alt="FreeFlow"
                className="relative z-10 h-10 w-auto object-contain"
              />
              <motion.div 
                animate={{ scale: [1, 1.5, 1], opacity: [0, 0.2, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0 bg-brand-accent rounded-2xl"
              />
            </motion.div>
            
            <motion.h2 
              variants={{
                initial: { opacity: 0, y: 30 },
                animate: { opacity: 1, y: 0 }
              }}
              transition={{ delay: 0.1 }}
              className="text-center text-5xl md:text-7xl font-black tracking-[-0.04em] leading-[1.05] text-slate-900"
            >
              <span className="block">立即体验</span>
              <span className="relative inline-block">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-brand-accent to-blue-400">FreeFlow 画布</span>
                <span className="absolute bottom-1 left-full ml-3 text-lg font-bold tracking-[0.18em] text-slate-400 md:text-2xl">
                  Demo
                </span>
              </span>
            </motion.h2>
            
            <motion.p 
              variants={{
                initial: { opacity: 0, y: 20 },
                animate: { opacity: 1, y: 0 }
              }}
              transition={{ delay: 0.2 }}
              className="text-slate-400 text-2xl font-medium tracking-tight"
            >
              完整功能版请下载本地桌面端
            </motion.p>
            
            <motion.button 
              variants={{
                initial: { opacity: 0, y: 20 },
                animate: { opacity: 1, y: 0 }
              }}
              transition={{ delay: 0.3 }}
              onClick={onOpenDemo}
              className="mt-6 bg-brand-accent text-white px-16 py-6 rounded-2xl font-black text-xl hover:scale-105 active:scale-95 transition-all shadow-[0_20px_40px_-10px_rgba(37,99,235,0.3)] flex items-center gap-4 group overflow-hidden relative"
            >
              <span className="relative z-10 flex items-center gap-4">
                立即体验 
                <ArrowRight size={24} strokeWidth={3} className="group-hover:translate-x-1 transition-transform" />
              </span>
              {/* 扫光效果 */}
              <motion.div 
                animate={{ x: ['-100%', '200%'] }}
                transition={{ duration: 3, repeat: Infinity, repeatDelay: 1 }}
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12 z-0"
              />
            </motion.button>
          </motion.div>
        </div>
      </motion.div>
    </div>
  </section>
);

const Footer = () => (
  <footer className="bg-slate-50 border-t border-slate-100 py-24">
    <div className="max-w-7xl mx-auto px-12">
      <div className="grid md:grid-cols-4 gap-16 mb-24">
        <div className="md:col-span-2 flex flex-col items-start gap-8">
          <div className="flex items-center gap-4">
            <img
              src={freeflowLogo}
              alt="FreeFlow"
              className="h-10 w-auto object-contain"
            />
            <div className="flex items-baseline gap-3">
              <span className="text-xl font-black tracking-tighter text-slate-900 leading-none">
                FreeFlow
              </span>
              <span className="text-sm font-bold tracking-[0.18em] text-slate-400 leading-none">
                无限画布工作台
              </span>
            </div>
          </div>
          <p className="text-slate-500 max-w-xs text-lg font-medium leading-relaxed">
            为知识与工作落地而生。
          </p>
        </div>
        <div>
          <h5 className="text-[10px] font-black uppercase tracking-[0.3em] mb-10 text-slate-900">产品特色</h5>
          <ul className="space-y-4 text-slate-500 text-sm font-semibold">
            <li><a href="#" className="hover:text-brand-accent transition-colors">内容承接</a></li>
            <li><a href="#" className="hover:text-brand-accent transition-colors">持续编辑</a></li>
            <li><a href="#" className="hover:text-brand-accent transition-colors">多端导出</a></li>
            <li><a href="#" className="hover:text-brand-accent transition-colors">语义关联</a></li>
          </ul>
        </div>
        <div>
          <h5 className="text-[10px] font-black uppercase tracking-[0.3em] mb-10 text-slate-900">致谢</h5>
          <ul className="space-y-4 text-slate-500 text-sm font-semibold">
            <li>由衷感谢所有参与内测，提供体验建议和反馈的朋友。</li>
          </ul>
        </div>
      </div>
      <div className="pt-12 border-t border-slate-200 flex flex-col md:flex-row justify-between items-center gap-8 text-[11px] text-slate-400 font-bold tracking-wide">
        <p>Copyright © 2026 WuXinbo. All rights reserved.</p>
        <div className="flex items-center gap-3 text-[10px] font-black tracking-[0.24em] uppercase">
          <span className="text-slate-400">联系方式</span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-500 tracking-[0.12em] normal-case">QQ: 1806598228</span>
        </div>
      </div>
    </div>
  </footer>
);

export default function App() {
  const [demoOpen, setDemoOpen] = useState(false);

  return (
    <div className="font-sans selection:bg-brand-accent/10 selection:text-brand-accent">
      <Navbar />
      <Hero />
      <BrandSocialProof />
      <Workflow />
      <Features />
      <CTA onOpenDemo={() => setDemoOpen(true)} />
      <Footer />
      <DemoOverlay open={demoOpen} onClose={() => setDemoOpen(false)} />
    </div>
  );
}
