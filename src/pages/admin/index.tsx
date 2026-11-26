import { useState } from 'react'
import { View, Text, Image, Input, Button } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { listAllOrders, isStaff, Order } from '../../services/order'
import { listGoods, saveProduct, deleteProduct, seedGoods, pickAndUploadImage, getShopConfig, saveShopConfig, DEFAULT_SHOP } from '../../services/goods'
import type { Product, ShopConfig } from '../../services/goods'
import './index.scss'

// 表单额外暂存价格原文，避免受控输入把 "0." 等中间态清掉
type GoodsForm = Product & { priceText: string }
const emptyForm: GoodsForm = { id: '', name: '', price: 0, image: '', colors: [], sizes: [], desc: '', priceText: '' }

export default function Admin() {
  const [orders, setOrders] = useState<Order[]>([])
  const [allowed, setAllowed] = useState(false)
  const [checked, setChecked] = useState(false)
  // 商品管理
  const [tab, setTab] = useState<'orders' | 'goods' | 'shop'>('orders')
  const [goods, setGoods] = useState<Product[]>([])
  const [form, setForm] = useState<GoodsForm | null>(null) // null=关闭表单
  // 门店设置
  const [shop, setShop] = useState<ShopConfig | null>(null)

  useLoad(() => {
    isStaff()
      .then(ok => {
        setAllowed(ok)
        if (ok) return loadOrders()
      })
      .catch(() => Taro.showToast({ title: '身份校验失败', icon: 'none' }))
      .finally(() => setChecked(true))
  })

  const loadOrders = () =>
    listAllOrders()
      .then(setOrders)
      .catch(() => Taro.showToast({ title: '订单加载失败', icon: 'none' }))

  // ---------- 商品管理 ----------
  const loadGoods = () =>
    listGoods(true)
      .then(setGoods)
      .catch(() => Taro.showToast({ title: '商品加载失败', icon: 'none' }))

  const switchTab = (t: 'orders' | 'goods' | 'shop') => {
    setTab(t)
    if (t === 'goods' && goods.length === 0) loadGoods()
    if (t === 'shop') loadShop()
  }

  // 选图并上传（微信端传云存储）
  const handlePickImage = () => {
    pickAndUploadImage()
      .then(image => setForm(f => (f ? { ...f, image } : f)))
      .catch(() => {})
  }

  // 更新某个 SKU 的库存（输入框空 = 不限，存 -1）
  const updateStock = (key: string, value: string) => {
    setForm(f => {
      if (!f) return f
      const v = value.trim() === '' ? -1 : Number(value) || 0
      return { ...f, stocks: { ...(f.stocks || {}), [key]: v } }
    })
  }

  const handleSaveGoods = async () => {
    if (!form) return
    if (!form.name.trim()) {
      return Taro.showToast({ title: '请填写商品名称', icon: 'none' })
    }
    const price = Number(form.priceText)
    if (!(price > 0)) {
      return Taro.showToast({ title: '请填写正确的价格', icon: 'none' })
    }
    if (!form.image) {
      return Taro.showToast({ title: '请上传商品图', icon: 'none' })
    }
    const colors = form.colors.filter(c => c.trim())
    const sizes = form.sizes.filter(s => s.trim())
    if (colors.length === 0) {
      return Taro.showToast({ title: '请至少填写一种颜色', icon: 'none' })
    }
    if (sizes.length === 0) {
      return Taro.showToast({ title: '请至少填写一个尺码', icon: 'none' })
    }
    // priceText 只用于输入框，不入库
    const { priceText, ...rest } = form
    // 裁剪 stocks：只保留当前颜色×尺码组合的 key；未填的按"不限"（-1）落库
    const stocks: Record<string, number> = {}
    for (const c of colors) {
      for (const s of sizes) {
        const k = `${c}-${s}`
        const v = form.stocks?.[k]
        stocks[k] = typeof v === 'number' && v >= 0 ? v : -1
      }
    }
    const p: Product = {
      ...rest,
      name: form.name.trim(),
      price,
      // 新商品生成 id；编辑沿用原 id
      id: form.id || `g${Date.now()}`,
      colors,
      sizes,
      stocks
    }
    try {
      await saveProduct(p)
    } catch {
      return Taro.showToast({ title: '保存失败，请重试', icon: 'none' })
    }
    Taro.showToast({ title: '已保存', icon: 'success' })
    setForm(null)
    loadGoods()
  }

  const handleDeleteGoods = (p: Product) => {
    Taro.showModal({
      title: '删除商品',
      content: `确定下架「${p.name}」吗？`,
      success: async (res) => {
        if (!res.confirm) return
        try {
          await deleteProduct(p.id)
        } catch {
          return Taro.showToast({ title: '下架失败，请重试', icon: 'none' })
        }
        Taro.showToast({ title: '已下架', icon: 'success' })
        loadGoods()
      }
    })
  }

  const handleSeed = async () => {
    try {
      const count = await seedGoods()
      Taro.showToast({ title: `已导入 ${count} 件`, icon: 'success' })
      loadGoods()
    } catch {
      Taro.showToast({ title: '导入失败，请重试', icon: 'none' })
    }
  }

  // ---------- 门店设置 ----------
  const loadShop = () =>
    getShopConfig(true)
      .then(setShop)
      .catch(() => setShop(DEFAULT_SHOP))

  const handleSaveShop = async () => {
    if (!shop) return
    if (!shop.name.trim()) {
      return Taro.showToast({ title: '请填写门店名称', icon: 'none' })
    }
    try {
      await saveShopConfig({ ...shop, name: shop.name.trim() })
    } catch {
      return Taro.showToast({ title: '保存失败，请重试', icon: 'none' })
    }
    Taro.showToast({ title: '已保存', icon: 'success' })
  }

  // 核销已拆分为独立页面 /pages/admin/verify（商家最高频操作，右下角悬浮按钮直达）

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  if (!checked) {
    return <View className='page'><Text className='tip'>校验身份中...</Text></View>
  }

  if (!allowed) {
    return <View className='page'><Text className='tip'>无商家权限，请联系店主在 staff 集合中添加你的 openid</Text></View>
  }

  return (
    <View className='page'>
      {/* 顶部标签切换 */}
      <View className='tabs'>
        <View className={`tab ${tab === 'orders' ? 'active' : ''}`} onClick={() => switchTab('orders')}>订单管理</View>
        <View className={`tab ${tab === 'goods' ? 'active' : ''}`} onClick={() => switchTab('goods')}>商品管理</View>
        <View className={`tab ${tab === 'shop' ? 'active' : ''}`} onClick={() => switchTab('shop')}>门店设置</View>
      </View>

      {tab === 'orders' && (
        <View>
          <Text className='section-title'>全部订单</Text>
          {orders.length === 0 ? (
            <Text className='tip'>暂无订单</Text>
          ) : (
            orders.map(o => (
              <View key={o.id} className='panel'>
                <View className='head'>
                  <View className='head-left'>
                    <Text className='time'>{formatTime(o.createdAt)}</Text>
                    {/* openid 后 6 位标识顾客；真实模式可再叠加昵称/手机号 */}
                    <Text className='customer'>顾客 {o.openid.slice(-6)}</Text>
                  </View>
                  <Text className={`status ${o.status !== 'paid' ? o.status === 'completed' ? 'done' : 'cancelled' : ''}`}>
                    {o.status === 'completed' ? '已完成' : o.status === 'cancelled' ? '已取消' : '待取件'}
                  </Text>
                </View>
                {o.items.map(i => (
                  <View key={i.key} className='row'>
                    <Image className='row-img' src={i.image} mode='aspectFill' />
                    <View className='row-info'>
                      <Text className='row-name'>{i.name}</Text>
                      <Text className='row-spec'>{i.color} / {i.size} × {i.qty}</Text>
                    </View>
                    <Text className='row-price'>¥{i.price * i.qty}</Text>
                  </View>
                ))}
                <View className='foot'>
                  <Text className='total'>合计 ¥{o.total}</Text>
                  <Text className='code'>取件码 {o.pickupCode}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      )}

      {tab === 'goods' && (
        <View>
          {form ? (
            <View className='panel goods-form'>
              <Text className='form-title'>{form.id ? '编辑商品' : '新增商品'}</Text>
              <View className='form-img' onClick={handlePickImage}>
                {form.image ? (
                  <Image className='form-img-preview' src={form.image} mode='aspectFill' />
                ) : (
                  <Text className='form-img-tip'>点击上传商品图</Text>
                )}
              </View>
              <Input className='form-input' placeholder='商品名称' value={form.name} onInput={e => setForm(f => (f ? { ...f, name: e.detail.value } : f))} />
              <Input className='form-input' type='digit' placeholder='价格（元）' value={form.priceText} onInput={e => setForm(f => (f ? { ...f, priceText: e.detail.value } : f))} />
              <Input className='form-input' placeholder='颜色，逗号分隔，如：白色,黑色' value={form.colors.join(',')} onInput={e => setForm(f => (f ? { ...f, colors: e.detail.value.split(',') } : f))} />
              <Input className='form-input' placeholder='尺码，逗号分隔，如：S,M,L' value={form.sizes.join(',')} onInput={e => setForm(f => (f ? { ...f, sizes: e.detail.value.split(',') } : f))} />
              <Input className='form-input' placeholder='商品描述' value={form.desc} onInput={e => setForm(f => (f ? { ...f, desc: e.detail.value } : f))} />
              <View className='form-row'>
                <Text className='form-label'>首页标签</Text>
                <View className='tag-opts'>
                  {(['', 'hot', 'new'] as const).map(t => (
                    <Text
                      key={t || 'none'}
                      className={`tag-opt ${form.tag === t ? 'active' : ''}`}
                      onClick={() => setForm(f => (f ? { ...f, tag: t } : f))}
                    >
                      {t === '' ? '无' : t === 'hot' ? '热销' : '新品'}
                    </Text>
                  ))}
                </View>
              </View>
              {/* SKU 库存矩阵：颜色 × 尺码，留空 = 不限 */}
              {form.colors.filter(c => c.trim()).length > 0 && form.sizes.filter(s => s.trim()).length > 0 && (
                <View className='stock-matrix'>
                  <Text className='stock-matrix-title'>库存设置（留空 = 不限）</Text>
                  <View className='stock-grid'>
                    <View className='stock-row'>
                      <Text className='stock-cell stock-head-cell'>颜色 \ 尺码</Text>
                      {form.sizes.filter(s => s.trim()).map(s => (
                        <Text key={s} className='stock-cell stock-head-cell'>{s}</Text>
                      ))}
                    </View>
                    {form.colors.filter(c => c.trim()).map(c => (
                      <View key={c} className='stock-row'>
                        <Text className='stock-cell stock-color'>{c}</Text>
                        {form.sizes.filter(s => s.trim()).map(s => {
                          const k = `${c}-${s}`
                          const v = form.stocks?.[k]
                          return (
                            <Input
                              key={k}
                              className='stock-input'
                              type='number'
                              placeholder='不限'
                              value={typeof v === 'number' && v >= 0 ? String(v) : ''}
                              onInput={e => updateStock(k, e.detail.value)}
                            />
                          )
                        })}
                      </View>
                    ))}
                  </View>
                </View>
              )}
              <View className='form-btns'>
                <Button className='form-cancel' onClick={() => setForm(null)}>取消</Button>
                <Button className='btn-primary form-save' onClick={handleSaveGoods}>保存</Button>
              </View>
            </View>
          ) : (
            <View>
              <View className='goods-toolbar'>
                <Button className='goods-tool-btn' onClick={handleSeed}>导入示例商品</Button>
                <Button className='btn-primary goods-tool-btn' onClick={() => setForm({ ...emptyForm, colors: [], sizes: [] })}>+ 新增商品</Button>
              </View>
              {goods.length === 0 ? (
                <Text className='tip'>还没有商品，点「导入示例商品」一键初始化，或新增商品</Text>
              ) : (
                goods.map(p => (
                  <View key={p.id} className='panel goods-row'>
                    <Image className='goods-img' src={p.image} mode='aspectFill' />
                    <View className='goods-info'>
                      <Text className='goods-name'>{p.name}</Text>
                      <Text className='goods-meta'>{p.colors.join('/')} | {p.sizes.join('/')}</Text>
                      <Text className='goods-price'>¥{p.price}</Text>
                    </View>
                    <View className='goods-ops'>
                      <Button className='goods-op' onClick={() => setForm({ ...p, priceText: String(p.price) })}>编辑</Button>
                      <Button className='goods-op danger' onClick={() => handleDeleteGoods(p)}>下架</Button>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}
        </View>
      )}
      {tab === 'shop' && shop && (
        <View className='panel goods-form'>
          <Text className='form-title'>门店设置</Text>
          <Input className='form-input' placeholder='门店名称，如：衣间' value={shop.name} onInput={e => setShop(s => (s ? { ...s, name: e.detail.value } : s))} />
          <Input className='form-input' placeholder='门店地址（展示给顾客）' value={shop.address} onInput={e => setShop(s => (s ? { ...s, address: e.detail.value } : s))} />
          <Input className='form-input' placeholder='取货须知，如：支付后凭取件码到店取货' value={shop.notice} onInput={e => setShop(s => (s ? { ...s, notice: e.detail.value } : s))} />
          <View className='form-btns'>
            <Button className='btn-primary form-save' onClick={handleSaveShop}>保存</Button>
          </View>
          <Text className='form-hint'>保存后：首页店名、支付成功页地址、详情页取货须知即时更新</Text>
        </View>
      )}

      {/* 悬浮核销按钮：任何标签页一键直达独立核销页（商家最高频操作） */}
      <View className='verify-fab' onClick={() => Taro.navigateTo({ url: '/pages/admin/verify/index' })}>
        <View className='fab-icon' />
      </View>
    </View>
  )
}
