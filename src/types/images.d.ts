/**
 * Metro 静态图片资源类型声明。
 *
 * 通过 `import image from './x.jpg'` 拿到的是 Metro 解析出的资源编号，
 * 可直接传给 <Image source={image} />，与 require('./x.jpg') 等价。
 */
declare module '*.jpg' {
  const value: number;
  export default value;
}

declare module '*.jpeg' {
  const value: number;
  export default value;
}

declare module '*.png' {
  const value: number;
  export default value;
}