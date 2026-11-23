// 购物车全局状态（模块级 store + useSyncExternalStore）
import { useSyncExternalStore } from 'react'

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

function emit() {
  items = [...items] // 更新引用以触发订阅
  listeners.forEach(l => l())
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

// 清空购物车（支付成功后调用）
export function clearCart() {
  items = []
  emit()
}

export const cartTotal = () => items.reduce((s, i) => s + i.price * i.qty, 0)
export const cartCount = () => items.reduce((s, i) => s + i.qty, 0)

// 订阅购物车的 Hook
export function useCart(): CartItem[] {
  return useSyncExternalStore(subscribe, () => items)
}
