// qrcode-generator 类型声明（npm 包未自带 d.ts）
declare module 'qrcode-generator' {
  type QRCode = {
    addData(data: string): void
    make(): void
    getModuleCount(): number
    isDark(row: number, col: number): boolean
  }
  function qrcode(typeNumber: number, errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H'): QRCode
  export default qrcode
}
