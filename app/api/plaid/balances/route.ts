import { prisma } from '@/lib/prisma'
import { plaidClient } from '@/lib/plaid'

export const dynamic = 'force-dynamic'

export async function GET() {
    const items = await prisma.plaidItem.findMany()

    const balances = []

    for (const item of items) {
        const response = await plaidClient.accountsBalanceGet({
            access_token: item.accessToken
        })

        balances.push({
            institution: item.institutionName,
            accounts: response.data.accounts.map((a: any) => ({
                name: a.name,
                type: a.type,
                balance: a.balances.current,
                available: a.balances.available
            }))
        })
    }

    return Response.json({ balances })
}