// 购物车全局状态（模块级 store + useSyncExternalStore）
import { useSyncExternalStore } from 'react'
import Taro from '@tarojs/taro'

export interface CartItem {
  key: string // 商品+规格唯一标识
  productId: string
  name: string
  price: number
  image: string
  color: string
  size: string
  qty: number
}

let items: CartItem[] = []
const listeners = new Set<() => void>()

const CART_TAB_INDEX = 1 // tabBar 中购物车的位置

// 把购物车件数同步到底部 tab 角标（非 tabBar 环境静默忽略）
function syncTabBadge() {
  const count = cartCount()
  try {
    if (count > 0) {
      Taro.setTabBarBadge({ index: CART_TAB_INDEX, text: String(count) }).catch(() => {})
    } else {
      Taro.removeTabBarBadge({ index: CART_TAB_INDEX }).catch(() => {})
    }
  } catch {
    // 无 tabBar 时（个别端/页面栈）忽略
  }
}

function emit() {
  items = [...items] // 更新引用以触发订阅
  listeners.forEach(l => l())
  syncTabBadge()
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

// 加入购物车（同规格自动合并数量）
export function addToCart(item: Omit<CartItem, 'qty'>, qty: number) {
  const exist = items.find(i => i.key === item.key)
  if (exist) {
    exist.qty += qty
    emit()
  } else {
    items = [...items, { ...item, qty }]
    emit()
  }
}

// 修改数量，减到 0 自动移除
export function changeQty(key: string, delta: number) {
  items = items
    .map(i => (i.key === key ? { ...i, qty: i.qty + delta } : i))
    .filter(i => i.qty > 0)
  emit()
}

// 删除条目
export function removeItem(key: string) {
  items = items.filter(i => i.key !== key)
  emit()
}

// 移除一批条目（支付成功后仅清除已结算的商品，未选中的保留）
export function removeItems(keys: string[]) {
  items = items.filter(i => !keys.includes(i.key))
  emit()
}

export const cartTotal = () => items.reduce((s, i) => s + i.price * i.qty, 0)
export const cartCount = () => items.reduce((s, i) => s + i.qty, 0)

// 订阅购物车的 Hook
export function useCart(): CartItem[] {
  return useSyncExternalStore(subscribe, () => items)
}
