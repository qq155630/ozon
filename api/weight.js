export default async function handler(req, res) {
  // ✅ CORS 支持（允许任何网站调用）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // 处理预检请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const authToken = req.headers['authorization'];
  const myToken = process.env.MY_AUTH_TOKEN;
  
  if (!myToken) {
    return res.status(500).json({ error: 'Server not configured', hint: 'MY_AUTH_TOKEN not set' });
  }
  
  if (authToken !== `Bearer ${myToken}`) {
    return res.status(401).json({ error: 'Unauthorized', got: authToken, expected_prefix: 'Bearer ...' });
  }
  
  const sku = req.query.sku;
  if (!sku) {
    return res.status(400).json({ error: 'Missing sku' });
  }
  
  const cookies = process.env.OZON_COOKIES;
  const companyId = process.env.OZON_COMPANY_ID;
  
  if (!cookies || !companyId) {
    return res.status(500).json({ 
      error: 'OZON credentials not configured',
      cookies_set: !!cookies,
      company_id_set: !!companyId
    });
  }
  
  try {
    // 第 1 步：search 拿 variant_id
    const searchRes = await fetch('https://seller.ozon.ru/api/v1/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies,
        'x-o3-company-id': companyId,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
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
    
    if (!searchRes.ok) {
      return res.status(200).json({ 
        success: false, 
        weight: 0, 
        error: 'search failed: ' + searchRes.status 
      });
    }
    
    const searchData = await searchRes.json();
    const variantId = searchData?.variants?.[0]?.variant_id;
    
    if (!variantId) {
      return res.status(200).json({ 
        success: false, 
        weight: 0, 
        error: 'variant not found' 
      });
    }
    
    // 第 2 步：bundle 拿重量
    const bundleRes = await fetch('https://seller.ozon.ru/api/site/seller-prototype/create-bundle-by-variant-id', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies,
        'x-o3-company-id': companyId,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: JSON.stringify({
        company_id: parseInt(companyId),
        variant_id: variantId,
        source: 'SOURCE_UI_COPY_MERGED'
      })
    });
    
    if (!bundleRes.ok) {
      return res.status(200).json({ 
        success: false, 
        weight: 0, 
        error: 'bundle failed: ' + bundleRes.status 
      });
    }
    
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
