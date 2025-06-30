import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const groupId = searchParams.get("groupId")
  const accessToken = searchParams.get("accessToken")
  const action = searchParams.get("action") || "posts"
  const after = searchParams.get("after") // For pagination

  if (!accessToken) {
    return NextResponse.json({ error: "Missing accessToken" }, { status: 400 })
  }

  try {
    let url = ""

    if (action === "name" && groupId) {
      url = `https://graph.facebook.com/v19.0/${groupId}?fields=name&access_token=${accessToken}`
    } else if (action === "posts" && groupId) {
      url = `https://graph.facebook.com/v19.0/${groupId}/feed?limit=25&fields=message,created_time,from{id,name,picture},attachments{media,type,url},full_picture,comments{message,from{id,name},created_time}&access_token=${accessToken}`

      // Add pagination if after token is provided
      if (after) {
        url += `&after=${after}`
      }
    } else if (action === "test") {
      url = `https://graph.facebook.com/v19.0/me?access_token=${accessToken}`
    } else {
      return NextResponse.json({ error: "Invalid action or missing groupId" }, { status: 400 })
    }

    const response = await fetch(url)
    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("Facebook API Error:", error)
    return NextResponse.json({ error: "Failed to fetch from Facebook API" }, { status: 500 })
  }
}
