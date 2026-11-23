// 二维码绘制工具：纯 JS 生成点阵 + Taro Canvas 绘制，H5/微信小程序双端可用
// 内容只编码 6 位取件码本身，方便商家扫码后直接得到核销码
import qrcode from 'qrcode-generator'
import Taro from '@tarojs/taro'

/**
 * 在 canvas 上绘制取件码二维码
 * @param canvasId canvas 节点 id（需与页面 <Canvas> 的 canvasId/id 一致）
 * @param text 二维码内容
 * @param cssPx canvas 的 CSS 宽高（正方形，px），用于按屏幕宽度换算
 */
export function drawQr(canvasId: string, text: string, cssPx: number) {
  try {
    const qr = qrcode(0, 'M') // typeNumber 0 = 自动选最小版本
    qr.addData(text)
    qr.make()

    const ctx = Taro.createCanvasContext(canvasId)
    const n = qr.getModuleCount()
    const pad = 8 // 静区（白边）
    const cell = (cssPx - pad * 2) / n

    // 白底
    ctx.setFillStyle('#ffffff')
    ctx.fillRect(0, 0, cssPx, cssPx)
    // 码点（+0.5 防止浮点取整出现细缝）
    ctx.setFillStyle('#1a1a1a')
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) {
          ctx.fillRect(pad + c * cell, pad + r * cell, cell + 0.5, cell + 0.5)
        }
      }
    }
    ctx.draw()
  } catch (e) {
    // 绘制失败静默，不影响订单列表展示
  }
}

// rpx → px（按当前屏幕宽度换算）
export function rpxToPx(rpx: number): number {
  try {
    const { windowWidth } = Taro.getSystemInfoSync()
    return Math.round((rpx / 750) * windowWidth)
  } catch {
    return Math.round(rpx / 2) // 375 宽屏兜底
  }
}
