import { useState } from 'react'
import { View, Text, Image, Input, Button } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { listAllOrders, verifyPickup, isStaff, Order } from '../../services/order'
import { listGoods, saveProduct, deleteProduct, seedGoods, pickAndUploadImage } from '../../services/goods'
import type { Product } from '../../data/products'
import './index.scss'

// 表单额外暂存价格原文，避免受控输入把 "0." 等中间态清掉
type GoodsForm = Product & { priceText: string }
const emptyForm: GoodsForm = { id: '', name: '', price: 0, image: '', colors: [], sizes: [], desc: '', priceText: '' }

export default function Admin() {
  const [orders, setOrders] = useState<Order[]>([])
  const [allowed, setAllowed] = useState(false)
  const [checked, setChecked] = useState(false)
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  // 商品管理
  const [tab, setTab] = useState<'orders' | 'goods'>('orders')
  const [goods, setGoods] = useState<Product[]>([])
  const [form, setForm] = useState<GoodsForm | null>(null) // null=关闭表单

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

  const switchTab = (t: 'orders' | 'goods') => {
    setTab(t)
    if (t === 'goods' && goods.length === 0) loadGoods()
  }

  // 选图并上传（微信端传云存储）
  const handlePickImage = () => {
    pickAndUploadImage()
      .then(image => setForm(f => (f ? { ...f, image } : f)))
      .catch(() => {})
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
    const p: Product = {
      ...rest,
      name: form.name.trim(),
      price,
      // 新商品生成 id；编辑沿用原 id
      id: form.id || `g${Date.now()}`,
      colors,
      sizes
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

  // 核销逻辑（手输与扫码共用）
  const doVerify = async (pickupCode: string) => {
    if (verifying) return
    setVerifying(true)
    try {
      const order = await verifyPickup(pickupCode)
      if (!order) {
        Taro.showToast({ title: '取件码无效或已核销', icon: 'none' })
      } else {
        Taro.showToast({ title: '核销成功', icon: 'success' })
        setCode('')
        await loadOrders()
      }
    } finally {
      setVerifying(false)
    }
  }

  // 按取件码核销（手输）
  const handleVerify = async () => {
    if (!code.trim()) return
    await doVerify(code.trim())
  }

  // 扫顾客出示的取件码二维码核销
  const handleScanVerify = () => {
    Taro.scanCode({
      success: (res) => {
        const scanned = (res.result || '').trim()
        if (!/^\d{6}$/.test(scanned)) {
          return Taro.showToast({ title: '这不是取件码二维码', icon: 'none' })
        }
        doVerify(scanned)
      },
      fail: (res) => {
        // 用户主动取消扫码是正常操作，静默处理（框架会打印 cancel 日志，可忽略）
        const msg = res && res.errMsg ? res.errMsg : ''
        if (!msg.includes('cancel')) {
          Taro.showToast({ title: '扫码不可用，可手输取件码核销', icon: 'none' })
        }
      }
    })
  }

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
      </View>

      {tab === 'orders' && (
        <View>
          <View className='panel verify-panel'>
            <Text className='verify-title'>取件核销</Text>
            <View className='verify-row'>
              <Input
                className='verify-input'
                type='number'
                maxlength={6}
                placeholder='输入买家 6 位取件码'
                value={code}
                onInput={e => setCode(e.detail.value)}
              />
              <Button className={`btn-primary verify-btn ${code.trim() ? '' : 'disabled'}`} onClick={handleVerify}>
                {verifying ? '核销中...' : '核销'}
              </Button>
            </View>
            <View className='scan-entry' onClick={handleScanVerify}>
              <View className='scan-icon' />
              <View className='scan-texts'>
                <Text className='scan-title'>扫码核销</Text>
                <Text className='scan-sub'>对准顾客「我的订单」里的取件码二维码</Text>
              </View>
              <Text className='scan-arrow'>›</Text>
            </View>
          </View>

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
    </View>
  )
}
