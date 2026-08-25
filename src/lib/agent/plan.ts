// 计划（Plan）类型定义：任务规划（Plan-and-Execute）模式的核心数据结构。
//
// 规划模式把「用户一句话」先拆成「一串步骤」清单，再逐步骤执行、最后汇总回答。
// 这里定义的类型贯穿整条链路：
//   - planner.ts：生成计划（把 LLM 拆出来的 JSON 解析成 Plan）
//   - loop.ts   ：执行计划（逐步骤执行，实时更新 StepStatus / result）
//   - plan-store.ts：持久化计划（steps 序列化成 JSON 存 SQLite）
//   - route.ts  ：透传计划进度（plan_created / step_* / plan_done 事件推给前端）
//
// 单独拆成一个文件而不是塞进 loop.ts，是因为 planner、loop、plan-store、route 四者
// 都要引用这些类型，放在一个「无任何依赖」的纯类型文件里能避免循环 import。

/** 单个步骤的生命周期状态 */
export type StepStatus = "pending" | "running" | "done" | "failed" | "skipped";

/** 计划中的一个步骤（一次用户请求被拆成若干个这样的步骤） */
export interface PlanStep {
  /** 步骤唯一 id（规划器生成，如 step1 / step2，用于进度事件定位到具体某一步） */
  id: string;
  /**
   * 步骤描述：只写「要做什么」，不写「结果会是什么」。
   * 这是喂给执行模型的指令——写结果会让模型提前「编造」结论，所以要刻意约束。
   */
  description: string;
  /**
   * 本步骤预期使用的工具名；只能取 null | "get_weather" | "web_search"。
   * null 表示纯推理步骤（组织语言、做判断、补问等，不需要查数据）。
   */
  tool: string | null;
  /** 为什么需要这一步：规划器给出的拆解理由，方便人/调试时理解计划的意图 */
  reason: string;
  /** 当前状态（规划器产出时默认 pending，loop 执行过程中循环流转） */
  status: StepStatus;
  /** 本步骤执行完成后沉淀的文本结果，供后续步骤与「汇总阶段」参考 */
  result?: string;
}

/** 一次用户请求拆解出的完整计划 */
export interface Plan {
  /** 用一句话概括用户目标（展示在进度提示上方，汇总阶段也会参考） */
  goal: string;
  /** 步骤清单（已按依赖顺序排好，planner 会约束最多 8 步） */
  steps: PlanStep[];
}