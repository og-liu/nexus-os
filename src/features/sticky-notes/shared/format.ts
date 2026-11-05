/**
 * 便签时间的展示格式化。
 *
 * 规则与实现已提到 `@/lib/format`（`formatDateTime`）：待办也要在卡片上显示创建时间，
 * 两个工具必须长得一样，所以只留一份实现。这里保留 `formatNoteTime` 这个名字，
 * 让便签这一侧不必为一次共用改造而改一串 import。
 */
export { formatDateTime as formatNoteTime } from "@/lib/format";
