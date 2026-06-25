// api/weight.js
export default async function handler(req, res) {
  // 简单的 token 验证
  const authToken = req.headers['authorization'];
  const myToken = process.env.MY_AUTH_TOKEN;
  
  if (!myToken) {
    return res.status(500).json({ error: 'Server not configured' });
  }
  
  if (authToken !== `Bearer ${myToken}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const sku = req.query.sku;
  if (!sku) {
    return res.status(400).json({ error: 'Missing sku' });
  }
  
  // 从环境变量读取本土店 cookies
  const cookies = process.env.OZON_COOKIES;
  const companyId = process.env.OZON_COMPANY_ID;
  
  if (!cookies || !companyId) {
    return res.status(500).json({ error: 'OZON credentials not configured' });
  }
  
  try {
    // 第 1 次请求：search 拿 variant_id
    const searchRes = await fetch('https://seller.ozon.ru/api/v1/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies,
        'x-o3-company-id': companyId,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify({
        company_id: parseInt(companyId),
        need_total: false,
        is_copy_allowed: true,
        filter: {
          children_nodes: {
            children_nodes: [{ input_leaf: { text: { value: String(sku) } } }],
            operator: 'AND'
          }
        },
        pagination: { limit: '50' }
      })
    });
    
    const searchData = await searchRes.json();
    const variantId = searchData?.variants?.[0]?.variant_id;
    
    if (!variantId) {
      return res.status(200).json({ 
        success: false, 
        weight: 0, 
        error: 'variant not found' 
      });
    }
    
    // 第 2 次请求：bundle 拿重量
    const bundleRes = await fetch('https://seller.ozon.ru/api/site/seller-prototype/create-bundle-by-variant-id', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies,
        'x-o3-company-id': companyId,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify({
        company_id: parseInt(companyId),
        variant_id: variantId,
        source: 'SOURCE_UI_COPY_MERGED'
      })
    });
    
    const bundleData = await bundleRes.json();
    const item = bundleData?.item;
    
    if (!item) {
      return res.status(200).json({ 
        success: false, 
        weight: 0, 
        error: 'no item data' 
      });
    }
    
    return res.status(200).json({
      success: true,
      sku: sku,
      weight: item.weight || 0,
      length: (item.depth || 0) / 10,
      width: (item.width || 0) / 10,
      height: (item.height || 0) / 10,
      name: item.name || ''
    });
    
  } catch (e) {
    return res.status(500).json({ 
      success: false, 
      error: e.message 
    });
  }
}