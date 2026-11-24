// 商品数据（示例数据，实际项目中由后端接口提供）
import p001 from '../assets/products/p001.jpg'
import p002 from '../assets/products/p002.jpg'
import p003 from '../assets/products/p003.jpg'
import p004 from '../assets/products/p004.jpg'
import p005 from '../assets/products/p005.jpg'
import p006 from '../assets/products/p006.jpg'
import p007 from '../assets/products/p007.jpg'
import p008 from '../assets/products/p008.jpg'

export interface Product {
  id: string
  name: string
  price: number
  image: string
  colors: string[]
  sizes: string[]
  desc: string
  // 运营标签：hot=热销 new=新品；空串/缺省=不打标
  tag?: 'hot' | 'new' | ''
}

export const products: Product[] = [
  {
    id: 'p001',
    name: '白色纯棉圆领T恤',
    price: 99,
    image: p001,
    colors: ['白色', '黑色', '藏青'],
    sizes: ['S', 'M', 'L', 'XL'],
    desc: '100%新疆长绒棉，亲肤透气，基础百搭款。'
  },
  {
    id: 'p002',
    name: '黑色修身牛仔裤',
    price: 259,
    image: p002,
    colors: ['黑色', '深蓝'],
    sizes: ['28', '29', '30', '31', '32'],
    desc: '弹力丹宁面料，修身剪裁，久穿不变形。'
  },
  {
    id: 'p003',
    name: '米色经典风衣',
    price: 599,
    image: p003,
    colors: ['米色', '卡其'],
    sizes: ['S', 'M', 'L'],
    desc: '防泼水面料，双排扣设计，春秋通勤首选。'
  },
  {
    id: 'p004',
    name: '碎花雪纺连衣裙',
    price: 329,
    image: p004,
    colors: ['碎花蓝', '碎花粉'],
    sizes: ['S', 'M', 'L'],
    desc: '轻盈雪纺，浪漫碎花，度假约会皆宜。'
  },
  {
    id: 'p005',
    name: '灰色连帽卫衣',
    price: 199,
    image: p005,
    colors: ['灰色', '黑色', '奶白'],
    sizes: ['M', 'L', 'XL'],
    desc: '加厚抓绒内里，宽松版型，保暖又时髦。'
  },
  {
    id: 'p006',
    name: '藏青羊毛大衣',
    price: 899,
    image: p006,
    colors: ['藏青', '驼色'],
    sizes: ['M', 'L', 'XL'],
    desc: '90%羊毛，直筒廓形，冬季气质单品。'
  },
  {
    id: 'p007',
    name: '蓝白条纹休闲衬衫',
    price: 179,
    image: p007,
    colors: ['蓝白条', '红白条'],
    sizes: ['S', 'M', 'L', 'XL'],
    desc: '牛津纺面料，经典条纹，正式休闲两相宜。'
  },
  {
    id: 'p008',
    name: '黑色速干运动T恤',
    price: 129,
    image: p008,
    colors: ['黑色', '深灰'],
    sizes: ['M', 'L', 'XL'],
    desc: '速干排汗面料，轻量剪裁，运动健身必备。'
  }
]

// 按 id 查找商品
export const getProduct = (id?: string) => products.find(p => p.id === id)
