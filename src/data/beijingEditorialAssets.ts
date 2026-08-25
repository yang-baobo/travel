/**
 * 北京首页编辑图片资源。
 *
 * - FLYAI_WUMEN_EDITORIAL：经 FlyAI 实际查询核对的午门图，用于首屏 Hero 立即显示。
 * - FIVE_FRAMES_EDITORIAL：用户自选的北京横向大图，仅用于"把这一眼，完整带走"五格拼图。
 *
 * 这些地址只用于首屏视觉和拼图展示；地点列表、票价与可预订状态仍以实时接口为准。
 */
import fiveFramesImage from '../../assets/images/beijing-five-frames.jpg';

export const FLYAI_WUMEN_EDITORIAL = {
  sourcePoiId: '210981',
  name: '午门',
  imageUrl: 'https://img.alicdn.com/tfscom/TB1uNNOigvD8KJjSsplSuuIEFXa',
} as const;

/**
 * 五格拼图（ONE PHOTO · FIVE FRAMES）的本地资源与裁切焦点。
 *
 * 原图 1920x856：
 * - 主体建筑位于画面水平中央（亮度分析：暗色主体集中在列 5-10 / 16）。
 * - 天空约占画面上部，因此焦点垂直方向轻微下移（0.52），
 *   保证手机端与桌面端都不把主体裁掉、天空不会占据大部分区域。
 */
export const FIVE_FRAMES_EDITORIAL = {
  image: fiveFramesImage,
  focus: { x: 0.5, y: 0.52 },
  sourceWidth: 1920,
  sourceHeight: 856,
  sourceLabel: 'USER SELECTED · BEIJING',
} as const;
