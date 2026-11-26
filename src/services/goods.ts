// 商品服务层：商品数据的唯一出口
// 微信端 + 已配置云环境时走 goods 云函数；否则降级为本地数据 + localStorage mock（H5 预览可用）
import Taro from '@tarojs/taro'
import { CLOUD_ENV_ID } from '../config'
import { products as localProducts } from '../data/products'
import type { Product } from '../data/products'

const cloudReady = () =>
  process.env.TARO_ENV === 'weapp' && !!CLOUD_ENV_ID && !!(Taro as any).cloud

const callCloud = async (data: Record<string, unknown>) => {
  const res = await (Taro as any).cloud.callFunction({ name: 'goods', data })
  return res.result
}

// mock 模式的商品存本地，未自定义过则用内置示例
const mockList = (): Product[] =>
  (Taro.getStorageSync('mock_goods') as Product[]) || localProducts

// 云端商品列表缓存（详情页同步查找用）
let cache: Product[] | null = null

// 拉取商品列表（force=true 强制刷新，商家改完商品后调用）
// 云端异常（集合未建好/网络）时回退本地数据，首页永远有内容
export async function listGoods(force = false): Promise<Product[]> {
  if (cloudReady()) {
    if (cache && !force) return cache
    try {
      const res = await callCloud({ action: 'list' })
      cache = res.list as Product[]
      return cache
    } catch (e) {
      console.warn('云端商品加载失败，回退本地数据', e)
    }
  }
  return mockList()
}

// 按 id 同步查找商品：先查云端缓存，再回退内置数据（详情页/扫码用）
export function findProduct(id?: string): Product | undefined {
  return cache?.find(p => p.id === id) || localProducts.find(p => p.id === id)
}

// 失效商品缓存：下单扣库存、商家改商品后调用，保证下次读取拿到最新数据
export function invalidateGoodsCache(): void {
  cache = null
}

// 按 id 异步查找：缓存/本地未命中时强制拉取一次云端列表
// 覆盖"扫码吊牌二维码冷启动直达详情页"场景（此时缓存还是空的）
export async function getProductById(id?: string): Promise<Product | undefined> {
  if (!id) return undefined
  const hit = findProduct(id)
  if (hit) return hit
  const list = await listGoods(true)
  return list.find(p => p.id === id)
}

// 新增或保存商品（店员操作）
export async function saveProduct(product: Product): Promise<void> {
  if (cloudReady()) {
    await callCloud({ action: 'save', product })
    cache = null
    return
  }
  const list = [...mockList()]
  const idx = list.findIndex(p => p.id === product.id)
  if (idx >= 0) list[idx] = product
  else list.unshift(product)
  Taro.setStorageSync('mock_goods', list)
}

// 删除商品（店员操作）
export async function deleteProduct(id: string): Promise<void> {
  if (cloudReady()) {
    await callCloud({ action: 'remove', id })
    cache = null
    return
  }
  Taro.setStorageSync('mock_goods', mockList().filter(p => p.id !== id))
}

// 把内置示例商品导入云端（首次启用商品上云时一键初始化）
export async function seedGoods(): Promise<number> {
  if (cloudReady()) {
    const res = await callCloud({ action: 'seed', list: localProducts })
    cache = null
    return res.count as number
  }
  Taro.setStorageSync('mock_goods', localProducts)
  return localProducts.length
}

// mock 模式的库存增减（delta=-1 下单扣减，+1 取消回补）
// 仅调整本地 mock 商品；商品未设 stocks 字段（不限库存）则跳过
export function adjustMockStock(
  items: { productId: string; color: string; size: string; qty: number }[],
  delta: 1 | -1
): void {
  const list = [...mockList()]
  let changed = false
  for (const it of items) {
    const idx = list.findIndex(p => p.id === it.productId)
    const p = list[idx]
    if (!p?.stocks) continue
    const key = `${it.color}-${it.size}`
    const cur = p.stocks[key]
    if (typeof cur !== 'number' || cur === -1) continue
    const next = Math.max(0, cur + delta * it.qty)
    list[idx] = { ...p, stocks: { ...p.stocks, [key]: next } }
    changed = true
  }
  if (changed) Taro.setStorageSync('mock_goods', list)
}

// 选择图片并上传（微信端上传到云存储返回 fileID；mock 模式仅返回本地临时路径）
export async function pickAndUploadImage(): Promise<string> {
  const pick = await Taro.chooseImage({ count: 1, sizeType: ['compressed'] })
  const filePath = pick.tempFilePaths[0]
  if (cloudReady()) {
    const ext = filePath.split('.').pop() || 'jpg'
    const res = await (Taro as any).cloud.uploadFile({
      cloudPath: `goods/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`,
      filePath
    })
    return res.fileID as string
  }
  return filePath
}

// ---------- 门店配置 ----------

export interface ShopConfig {
  name: string // 店名（首页头部）
  address: string // 门店地址（支付成功页展示）
  notice: string // 取货须知（详情页服务保障行）
}

// 云端未配置时的默认值
export const DEFAULT_SHOP: ShopConfig = {
  name: '衣间',
  address: '',
  notice: '支付后凭取件码到店取货，免运费'
}

// 门店配置缓存（会话级）
let shopCache: ShopConfig | null = null

// 拉取门店配置（force=true 强制刷新，商家保存后调用）；失败回退 mock/默认值
export async function getShopConfig(force = false): Promise<ShopConfig> {
  if (shopCache && !force) return shopCache
  if (cloudReady()) {
    try {
      const res = await callCloud({ action: 'getShop' })
      if (res.config) {
        shopCache = {
          name: res.config.name || DEFAULT_SHOP.name,
          address: res.config.address || '',
          notice: res.config.notice || DEFAULT_SHOP.notice
        }
        return shopCache
      }
    } catch (e) {
      console.warn('门店配置加载失败，使用默认', e)
    }
  }
  shopCache = (Taro.getStorageSync('mock_shop') as ShopConfig) || DEFAULT_SHOP
  return shopCache
}

// 同步取当前配置（未拉取过时返回默认值，适合页面首帧渲染）
export function findShopConfig(): ShopConfig {
  return shopCache || DEFAULT_SHOP
}

// 保存门店配置（店员操作）
export async function saveShopConfig(c: ShopConfig): Promise<void> {
  if (cloudReady()) {
    await callCloud({ action: 'saveShop', config: c })
    shopCache = { ...c }
    return
  }
  Taro.setStorageSync('mock_shop', c)
  shopCache = { ...c }
}
