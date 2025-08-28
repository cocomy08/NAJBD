    // api/verify.js
    const TableStore = require('tablestore');
    const jwt = require('jsonwebtoken');

    // 从环境变量中读取密钥，用于加密令牌。请务必在 Vercel 中设置这个变量！
    const JWT_SECRET = process.env.JWT_SECRET || 'a-secure-default-secret-key-for-testing';

    // Vercel 会自动处理请求，我们只需要导出一个处理函数
    export default async function handler(request, response) {
        // 设置 CORS 头部，允许来自 Netlify 前端的跨域请求
        response.setHeader('Access-Control-Allow-Credentials', true);
        response.setHeader('Access-Control-Allow-Origin', 'https://flmkneg32ca.netlify.app');
        response.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
        response.setHeader(
            'Access-Control-Allow-Headers',
            'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
        );

        // 浏览器会先发送一个 OPTIONS "预检"请求，我们直接返回成功即可
        if (request.method === 'OPTIONS') {
            response.status(200).end();
            return;
        }
        
        // 只处理 POST 请求
        if (request.method !== 'POST') {
            return response.status(405).json({ message: 'Method Not Allowed' });
        }

        const { invitationCode } = request.body;

        if (!invitationCode) {
            return response.status(400).json({ success: false, message: '请提供邀请码。' });
        }

        const client = new TableStore.Client({
            accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
            accessKeySecret: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
            stsToken: process.env.ALIBABA_CLOUD_SECURITY_TOKEN, // Vercel 会自动从角色获取
            endpoint: process.env.TABLE_STORE_ENDPOINT,
            instanceName: process.env.TABLE_STORE_INSTANCE_NAME
        });

        try {
            const getParams = {
                tableName: 'invitation_codes',
                primaryKey: [{ 'code': invitationCode }],
            };
            const getResult = await client.getRow(getParams);
            const row = getResult.row;

            if (!row || !row.attributeColumns) {
                return response.status(200).json({ success: false, message: '无效的邀请码。' });
            }

            const used = row.attributeColumns.find(col => col.name === 'used')?.value || false;
            if (used) {
                return response.status(200).json({ success: false, message: '邀请码已被使用。' });
            }

            const updateParams = {
                tableName: 'invitation_codes',
                primaryKey: [{ 'code': invitationCode }],
                updateOfAttributeColumns: [{ 'PUT': [{ 'used': true }] }],
            };
            await client.updateRow(updateParams);

            // 验证成功，生成一个JWT令牌
            const token = jwt.sign(
                { code: invitationCode, verifiedAt: Date.now() },
                JWT_SECRET,
                { expiresIn: '30d' } // 令牌有效期30天
            );

            return response.status(200).json({ success: true, message: '验证成功！', token: token });

        } catch (error) {
            console.error('Error verifying code:', error);
            return response.status(500).json({ success: false, message: '服务器错误，请稍后再试。' });
        }
    }
    