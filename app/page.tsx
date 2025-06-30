"use client"

import type React from "react"

import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Search,
  Download,
  RefreshCw,
  Upload,
  User,
  Phone,
  Clock,
  ExternalLink,
  ImageIcon,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Bell,
  BellOff,
  BarChart3,
  Users,
  Star,
  StarOff,
  Filter,
  TrendingUp,
  Target,
  AlertCircle,
  CheckCircle,
  XCircle,
} from "lucide-react"

interface Post {
  id: string
  message?: string
  created_time: string
  full_picture?: string
  attachments?: {
    data: Array<{
      type: string
      media?: {
        image?: {
          src: string
        }
      }
      url?: string
    }>
  }
  from?: {
    id: string
    name: string
    picture?: {
      data: {
        url: string
      }
    }
  }
  comments?: {
    data: Array<{
      id: string
      message: string
      created_time: string
      from?: {
        id: string
        name: string
      }
    }>
  }
}

interface PostData {
  groupId: string
  authorName: string
  phone: string
  message: string
  time: string
  authorId: string
  hasImages: boolean
  commentsCount: number
}

interface CommentData {
  commentId: string
  authorName: string
  phone: string
  message: string
  time: string
  authorId: string
  postId: string
}

interface Customer {
  id: string
  name: string
  phone: string
  status: "interested" | "contacted" | "converted" | "not_interested"
  posts: string[]
  notes: string
  lastContact: Date
  score: number
}

export default function FacebookMonitor() {
  const [accessToken, setAccessToken] = useState("")
  const [groupIds, setGroupIds] = useState<string[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [allPostsData, setAllPostsData] = useState<PostData[]>([])
  const [allCommentsData, setAllCommentsData] = useState<CommentData[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [autoReload, setAutoReload] = useState(false)
  const [phoneFile, setPhoneFile] = useState<File | null>(null)
  const [loadingStatus, setLoadingStatus] = useState<string>("")
  const [searchingPhones, setSearchingPhones] = useState<Set<string>>(new Set())
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set())
  const [nextPageTokens, setNextPageTokens] = useState<{ [groupId: string]: string }>({})
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [autoUpdateCountdown, setAutoUpdateCountdown] = useState<number>(0)
  const [keywordFilters, setKeywordFilters] = useState<string[]>([])
  const [filterEnabled, setFilterEnabled] = useState(false)
  const [newKeyword, setNewKeyword] = useState("")
  const [showKeywordManager, setShowKeywordManager] = useState(false)

  // New features state
  const [darkMode, setDarkMode] = useState(false)
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [savedPosts, setSavedPosts] = useState<Set<string>>(new Set())
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [dateFilter, setDateFilter] = useState<string>("all")
  const [scoreFilter, setScoreFilter] = useState<number>(0)
  const [activeTab, setActiveTab] = useState("posts")
  const [regexSearch, setRegexSearch] = useState(false)
  const [excludeKeywords, setExcludeKeywords] = useState<string[]>([])

  const tokenFileRef = useRef<HTMLInputElement>(null)
  const groupFileRef = useRef<HTMLInputElement>(null)
  const phoneFileRef = useRef<HTMLInputElement>(null)
  const intervalRef = useRef<NodeJS.Timeout>()
  const countdownRef = useRef<NodeJS.Timeout>()
  const observerRef = useRef<IntersectionObserver>()
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const keywordFileRef = useRef<HTMLInputElement>(null)

  // Request notification permission
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission()
    }
  }, [])

  // Dark mode effect
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }
  }, [darkMode])

  const showNotification = (title: string, body: string) => {
    if (notificationsEnabled && "Notification" in window && Notification.permission === "granted") {
      new Notification(title, {
        body,
        icon: "/favicon.ico",
        tag: "facebook-monitor",
      })
    }
  }

  const getPostImages = (post: Post): string[] => {
    const images: string[] = []

    if (post.full_picture) {
      images.push(post.full_picture)
    }

    if (post.attachments?.data) {
      post.attachments.data.forEach((attachment) => {
        if (attachment.type === "photo" && attachment.media?.image?.src) {
          images.push(attachment.media.image.src)
        }
      })
    }

    return images
  }

  const calculatePostScore = (post: Post): number => {
    let score = 0
    const message = post.message || ""

    // Score based on keywords
    keywordFilters.forEach((keyword) => {
      if (message.toLowerCase().includes(keyword.toLowerCase())) {
        score += 10
      }
    })

    // Score based on comments
    score += (post.comments?.data?.length || 0) * 2

    // Score based on images
    if (getPostImages(post).length > 0) {
      score += 5
    }

    return score
  }

  const addToCustomers = (post: Post, phone: string) => {
    if (!post.from?.id || !post.from?.name) return

    const existingCustomer = customers.find((c) => c.id === post.from?.id)
    const score = calculatePostScore(post)

    if (existingCustomer) {
      setCustomers((prev) =>
        prev.map((c) => (c.id === post.from?.id ? { ...c, posts: [...c.posts, post.id], score: c.score + score } : c)),
      )
    } else {
      const newCustomer: Customer = {
        id: post.from.id,
        name: post.from.name,
        phone: phone !== "غير معروف" ? phone : "",
        status: "interested",
        posts: [post.id],
        notes: "",
        lastContact: new Date(),
        score: score,
      }
      setCustomers((prev) => [...prev, newCustomer])

      if (score > 20) {
        showNotification("عميل محتمل مهم!", '${post.from.name} - نقاط: ${score}')
      }
    }
  }

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsText(file)
    })
  }

  const handleTokenFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      try {
        const text = await readFileAsText(file)
        setAccessToken(text.trim())
        setLoadingStatus("✅ تم تحميل ملف التوكن")
      } catch (error) {
        alert("خطأ في قراءة ملف التوكن")
      }
    }
  }

  const handleGroupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      try {
        const text = await readFileAsText(file)
        const ids = JSON.parse(text.trim())
        setGroupIds(ids)
        setLoadingStatus('✅ تم تحميل ${ids.length} معرف جروب')
      } catch (error) {
        alert("خطأ في قراءة ملف معرفات الجروبات")
      }
    }
  }

  const handlePhoneFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setPhoneFile(file)
      setLoadingStatus('✅ تم تحديد ملف المستخدمين: ${(file.size / (1024 * 1024 * 1024)).toFixed(2)} جيجا')
    }
  }

  const handleKeywordFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      try {
        const text = await readFileAsText(file)
        const keywords = JSON.parse(text.trim())
        setKeywordFilters(keywords)
        setLoadingStatus('✅ تم تحميل ${keywords.length} كلمة مفتاحية للفلترة')
      } catch (error) {
        alert("خطأ في قراءة ملف الكلمات المفتاحية")
      }
    }
  }

  const addKeyword = () => {
    if (newKeyword.trim() && !keywordFilters.includes(newKeyword.trim())) {
      setKeywordFilters([...keywordFilters, newKeyword.trim()])
      setNewKeyword("")
      setLoadingStatus('✅ تم إضافة الكلمة: ${newKeyword.trim()}')
    }
  }

  const removeKeyword = (keyword: string) => {
    setKeywordFilters(keywordFilters.filter((k) => k !== keyword))
    setLoadingStatus('❌ تم حذف الكلمة: ${keyword}')
  }

  const downloadKeywords = () => {
    const blob = new Blob([JSON.stringify(keywordFilters, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "filters.txt"
    a.click()
    URL.revokeObjectURL(url)
  }

  const containsKeywords = (text: string): boolean => {
    if (!filterEnabled || keywordFilters.length === 0) return true

    const lowerText = text.toLowerCase()

    if (regexSearch) {
      try {
        return keywordFilters.some((keyword) => {
          const regex = new RegExp(keyword, "i")
          return regex.test(text)
        })
      } catch {
        return keywordFilters.some((keyword) => lowerText.includes(keyword.toLowerCase()))
      }
    }

    const hasKeywords = keywordFilters.some((keyword) => lowerText.includes(keyword.toLowerCase()))
    const hasExcluded = excludeKeywords.some((keyword) => lowerText.includes(keyword.toLowerCase()))

    return hasKeywords && !hasExcluded
  }

  const searchPhoneInFile = async (userId: string): Promise<string> => {
    if (!phoneFile) return "غير معروف"

    return new Promise((resolve) => {
      const reader = new FileReader()
      const chunkSize = 1024 * 1024 // 1MB chunks
      let offset = 0
      let buffer = ""
      let found = false

      const readChunk = () => {
        if (found || offset >= phoneFile.size) {
          resolve("غير معروف")
          return
        }

        const slice = phoneFile.slice(offset, offset + chunkSize)
        reader.readAsText(slice)
      }

      reader.onload = (e) => {
        const chunk = e.target?.result as string
        buffer += chunk

        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          if (line.trim() && line.includes('"${userId}"')) {
            try {
              const cleanLine = line.trim().replace(/,$/, "")
              const parsed = JSON.parse(cleanLine)

              if (parsed[userId]) {
                found = true
                resolve(parsed[userId])
                return
              }
            } catch (parseError) {
              // Continue searching
            }
          }
        }

        offset += chunkSize
        if (offset < phoneFile.size) {
          readChunk()
        } else {
          resolve("غير معروف")
        }
      }

      reader.onerror = () => resolve("غير معروف")
      readChunk()
    })
  }

  const fetchGroupName = async (groupId: string): Promise<string> => {
    try {
      const response = await fetch(
        '/api/facebook?groupId=${groupId}&accessToken=${encodeURIComponent(accessToken)}&action=name',
      )

      if (!response.ok) {
        console.warn('⚠️ لا يمكن جلب اسم الجروب ${groupId}: ${response.status}')
        return groupId
      }

      const data = await response.json()

      if (data.error) {
        console.warn('⚠️ خطأ في جلب اسم الجروب:', data.error)
        return groupId
      }

      return data.name || groupId
    } catch (error) {
      console.warn('⚠️ خطأ في جلب اسم الجروب ${groupId}:', error)
      return groupId
    }
  }

  const loadPosts = async (isLoadMore = false, isAutoUpdate = false) => {
    if (!accessToken || groupIds.length === 0) {
      if (!isAutoUpdate) {
        alert("⚠️ تأكد من رفع ملفات التوكن ومعرفات الجروبات")
      }
      return
    }

    if (isLoadMore) {
      setLoadingMore(true)
    } else {
      setLoading(true)
    }

    const newPostsData: PostData[] = []
    const newCommentsData: CommentData[] = []
    const allPosts: Post[] = []

    try {
      if (!isAutoUpdate) {
        setLoadingStatus(isLoadMore ? "📜 جاري تحميل منشورات أقدم..." : "🔍 بدء تحميل المنشورات...")
      }

      for (let i = 0; i < groupIds.length; i++) {
        const groupId = groupIds[i]
        if (!isAutoUpdate) {
          setLoadingStatus('📡 جاري تحميل الجروب ${i + 1}/${groupIds.length}: ${groupId}')
        }

        try {
          const groupName = await fetchGroupName(groupId)
          if (!isAutoUpdate) {
            setLoadingStatus('✅ اسم الجروب: ${groupName}')
          }

          let url = '/api/facebook?groupId=${groupId}&accessToken=${encodeURIComponent(accessToken)}&action=posts'
          if (isLoadMore && nextPageTokens[groupId]) {
            url += '&after=${nextPageTokens[groupId]}'
          }

          const response = await fetch(url)

          if (!response.ok) {
            const errorData = await response.json()
            console.error('❌ خطأ في API للجروب ${groupId}:', errorData)
            continue
          }

          const data = await response.json()

          if (data.error) {
            console.error('❌ خطأ من Facebook API:', data.error)
            continue
          }

          if (data.paging?.next) {
            const url = new URL(data.paging.next)
            const after = url.searchParams.get("after")
            if (after) {
              setNextPageTokens((prev) => ({ ...prev, [groupId]: after }))
            }
          }

          if (data.data && data.data.length > 0) {
            if (!isAutoUpdate) {
              setLoadingStatus('📝 تم العثور على ${data.data.length} منشور')
            }

            for (const post of data.data) {
              allPosts.push(post)

              const author = post.from || {}
              const authorId = author.id || ""
              const authorName = author.name || "غير معروف"

              const hasImages = !!(post.full_picture || post.attachments?.data?.some((att) => att.type === "photo"))

              newPostsData.push({
                groupId: groupName,
                authorName,
                phone: "اضغط للبحث",
                message: post.message || "",
                time: new Date(post.created_time).toLocaleString("ar-EG"),
                authorId,
                hasImages,
                commentsCount: post.comments?.data?.length || 0,
              })

              if (post.comments?.data) {
                for (const comment of post.comments.data) {
                  const commentAuthor = comment.from || {}
                  const commentAuthorId = commentAuthor.id || ""
                  const commentAuthorName = commentAuthor.name || "مجهول"

                  newCommentsData.push({
                    commentId: comment.id,
                    authorName: commentAuthorName,
                    phone: "اضغط للبحث",
                    message: comment.message,
                    time: new Date(comment.created_time).toLocaleString("ar-EG"),
                    authorId: commentAuthorId,
                    postId: post.id,
                  })
                }
              }
            }
          }
        } catch (groupError) {
          console.error('❌ خطأ في معالجة الجروب ${groupId}:', groupError)
        }
      }

      if (isLoadMore) {
        setPosts((prev) => [...prev, ...allPosts])
        setAllPostsData((prev) => [...prev, ...newPostsData])
        setAllCommentsData((prev) => [...prev, ...newCommentsData])
        setLoadingStatus('✅ تم تحميل ${allPosts.length} منشور إضافي')
      } else {
        setPosts(allPosts)
        setAllPostsData(newPostsData)
        setAllCommentsData(newCommentsData)
        if (!isAutoUpdate) {
          setLoadingStatus(
            '✅ تم تحميل ${allPosts.length} منشور و ${newCommentsData.length} تعليق من ${groupIds.length} جروب',
          )
        }
      }

      setLastUpdate(new Date())

      // Show notification for new posts
      if (isAutoUpdate && allPosts.length > 0) {
        const highScorePosts = allPosts.filter((post) => calculatePostScore(post) > 15)
        if (highScorePosts.length > 0) {
          showNotification("منشورات جديدة مهمة!", 'تم العثور على ${highScorePosts.length} منشور مهم')
        }
      }

      if (!isAutoUpdate && allPosts.length === 0) {
        alert("⚠️ لم يتم العثور على أي منشورات. تأكد من صحة التوكن ومعرفات الجروبات")
      }
    } catch (error) {
      console.error("❌ خطأ عام في تحميل المنشورات:", error)
      if (!isAutoUpdate) {
        setLoadingStatus('❌ خطأ في تحميل المنشورات: ${error.message}')
      }
    } finally {
      if (isLoadMore) {
        setLoadingMore(false)
      } else {
        setLoading(false)
      }
    }
  }

  const loadAllPosts = () => loadPosts(false, false)
  const loadMorePosts = () => loadPosts(true, false)
  const autoUpdatePosts = () => loadPosts(false, true)

  const testAccessToken = async () => {
    if (!accessToken) {
      alert("⚠️ يرجى رفع ملف التوكن أولاً")
      return
    }

    try {
      setLoading(true)
      setLoadingStatus("🔑 جاري اختبار التوكن...")

      const response = await fetch('/api/facebook?accessToken=${encodeURIComponent(accessToken)}&action=test')
      const data = await response.json()

      if (data.error) {
        alert('❌ التوكن غير صحيح: ${data.error.message}')
        setLoadingStatus('❌ التوكن غير صحيح: ${data.error.message}')
      } else {
        alert('✅ التوكن صحيح! مرحباً ${data.name || "مستخدم"}')
        setLoadingStatus('✅ التوكن صحيح! مرحباً ${data.name || "مستخدم"}')
      }
    } catch (error) {
      alert('❌ خطأ في اختبار التوكن: ${error.message}')
      setLoadingStatus('❌ خطأ في اختبار التوكن: ${error.message}')
    } finally {
      setLoading(false)
    }
  }

  const downloadCSV = () => {
    const headers = ["Type", "GroupId", "AuthorName", "Phone", "Message", "Time", "AuthorId", "PostId", "Score"]
    const csvRows = [headers.join(",")]

    allPostsData.forEach((row) => {
      const post = posts.find((p) => p.from?.id === row.authorId)
      const score = post ? calculatePostScore(post) : 0
      const values = [
        "Post",
        row.groupId,
        row.authorName,
        row.phone,
        row.message,
        row.time,
        row.authorId,
        "",
        score.toString(),
      ].map((val) => `"${val.toString().replace(/"/g, '""')}"`)

      csvRows.push(values.join(","))
    })

    allCommentsData.forEach((row) => {
      const values = [
        "Comment",
        "",
        row.authorName,
        row.phone,
        row.message,
        row.time,
        row.authorId,
        row.postId,
        "0",
      ].map((val) => `"${val.toString().replace(/"/g, '""')}"`)

      csvRows.push(values.join(","))
    })

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "facebook_posts_and_comments.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadCustomersReport = () => {
    const headers = ["Name", "Phone", "Status", "Score", "Posts Count", "Last Contact", "Notes"]
    const csvRows = [headers.join(",")]

    customers.forEach((customer) => {
      const values = [
        customer.name,
        customer.phone,
        customer.status,
        customer.score.toString(),
        customer.posts.length.toString(),
        customer.lastContact.toLocaleDateString("ar-EG"),
        customer.notes,
      ].map((val) => `"${val.toString().replace(/"/g, '""')}"`)
      csvRows.push(values.join(","))
    })

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "customers_report.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  const filteredPosts = posts.filter((post) => {
    // Date filter
    if (dateFilter !== "all") {
      const postDate = new Date(post.created_time)
      const now = new Date()
      const diffDays = Math.floor((now.getTime() - postDate.getTime()) / (1000 * 60 * 60 * 24))

      if (dateFilter === "today" && diffDays > 0) return false
      if (dateFilter === "week" && diffDays > 7) return false
      if (dateFilter === "month" && diffDays > 30) return false
    }

    // Score filter
    const score = calculatePostScore(post)
    if (score < scoreFilter) return false

    // Search query filter
    const searchText = searchQuery.toLowerCase()
    const message = (post.message || "").toLowerCase()
    const authorName = (post.from?.name || "").toLowerCase()
    const comments = post.comments?.data?.some(
      (comment) =>
        comment.message.toLowerCase().includes(searchText) ||
        (comment.from?.name || "").toLowerCase().includes(searchText),
    )
    const matchesSearch = message.includes(searchText) || authorName.includes(searchText) || comments

    // Keyword filter
    const postText = '${post.message || ""} ${post.from?.name || ""}'
    const commentTexts = post.comments?.data?.map((c) => '${c.message} ${c.from?.name || ""}').join(" ") || ""
    const allText = '${postText} ${commentTexts}'
    const matchesKeywords = containsKeywords(allText)

    return matchesSearch && matchesKeywords
  })

  const toggleComments = (postId: string) => {
    setExpandedComments((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(postId)) {
        newSet.delete(postId)
      } else {
        newSet.add(postId)
      }
      return newSet
    })
  }

  const toggleSavePost = (postId: string) => {
    setSavedPosts((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(postId)) {
        newSet.delete(postId)
      } else {
        newSet.add(postId)
      }
      return newSet
    })
  }

  const searchSinglePhone = async (authorId: string, authorName: string, isComment = false): Promise<string> => {
    if (!phoneFile || !authorId) return "غير معروف"

    setSearchingPhones((prev) => new Set(prev).add(authorId))

    try {
      setLoadingStatus('🔍 جاري البحث عن رقم هاتف: ${authorName}')
      const phone = await searchPhoneInFile(authorId)
      setLoadingStatus('✅ تم العثور على الرقم: ${phone}')

      if (isComment) {
        setAllCommentsData((prev) =>
          prev.map((comment) => (comment.authorId === authorId ? { ...comment, phone } : comment)),
        )
      } else {
        setAllPostsData((prev) => prev.map((post) => (post.authorId === authorId ? { ...post, phone } : post)))

        // Add to customers if phone found
        const post = posts.find((p) => p.from?.id === authorId)
        if (post && phone !== "غير معروف") {
          addToCustomers(post, phone)
        }
      }

      return phone
    } catch (error) {
      setLoadingStatus('❌ خطأ في البحث عن رقم الهاتف')
      return "غير معروف"
    } finally {
      setSearchingPhones((prev) => {
        const newSet = new Set(prev)
        newSet.delete(authorId)
        return newSet
      })
    }
  }

  const formatCountdown = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return '${minutes}:${remainingSeconds.toString().padStart(2, "0")}'
  }

  const getAnalytics = () => {
    const totalPosts = posts.length
    const totalComments = allCommentsData.length
    const postsWithImages = posts.filter((p) => getPostImages(p).length > 0).length
    const highScorePosts = posts.filter((p) => calculatePostScore(p) > 15).length
    const todayPosts = posts.filter((p) => {
      const postDate = new Date(p.created_time)
      const today = new Date()
      return postDate.toDateString() === today.toDateString()
    }).length

    const keywordStats = keywordFilters
      .map((keyword) => ({
        keyword,
        count: posts.filter((p) => (p.message || "").toLowerCase().includes(keyword.toLowerCase())).length,
      }))
      .sort((a, b) => b.count - a.count)

    return {
      totalPosts,
      totalComments,
      postsWithImages,
      highScorePosts,
      todayPosts,
      keywordStats,
      totalCustomers: customers.length,
      interestedCustomers: customers.filter((c) => c.status === "interested").length,
    }
  }

  const analytics = getAnalytics()

  // Auto-reload functionality
  useEffect(() => {
    if (autoReload && posts.length > 0) {
      setAutoUpdateCountdown(300)

      countdownRef.current = setInterval(() => {
        setAutoUpdateCountdown((prev) => {
          if (prev <= 1) {
            autoUpdatePosts()
            return 300
          }
          return prev - 1
        })
      }, 1000)

      intervalRef.current = setInterval(autoUpdatePosts, 5 * 60 * 1000)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      if (countdownRef.current) {
        clearInterval(countdownRef.current)
      }
      setAutoUpdateCountdown(0)
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      if (countdownRef.current) {
        clearInterval(countdownRef.current)
      }
    }
  }, [autoReload, posts.length])

  // Infinite scroll
  const lastPostElementRef = useCallback(
    (node: HTMLDivElement) => {
      if (loading || loadingMore) return
      if (observerRef.current) observerRef.current.disconnect()
      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && Object.keys(nextPageTokens).length > 0) {
          loadMorePosts()
        }
      })
      if (node) observerRef.current.observe(node)
    },
    [loading, loadingMore, nextPageTokens],
  )

  return (
<div
  className={`min-h-screen p-4 transition-colors ${
    darkMode ? 'bg-gray-900' : 'bg-gradient-to-br from-blue-50 to-indigo-100'
  }`}
  dir="rtl">
      <div className="max-w-7xl mx-auto">
	  <p>تجربة</p>
        {/* Header */}
        <Card className={'mb-6 shadow-lg border-0 ${darkMode ? 'bg-gray-800' : 'bg-white/80'} backdrop-blur-sm'}>
          <CardHeader className="text-center bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-t-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDarkMode(!darkMode)}
                  className="text-white hover:bg-white/20"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setNotificationsEnabled(!notificationsEnabled)}
                  className="text-white hover:bg-white/20"
                >
                  {notificationsEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                </Button>
              </div>
              <CardTitle className="text-3xl font-bold">📡 متابعة منشورات الجروبات المتقدمة</CardTitle>
              <div className="w-20"></div>
            </div>
            <p className="text-blue-100 mt-2">أداة احترافية لمراقبة وتحليل منشورات فيسبوك مع ذكاء اصطناعي</p>
            {lastUpdate && (
              <div className="flex items-center justify-center gap-4 mt-3 text-sm">
                <span>آخر تحديث: {lastUpdate.toLocaleTimeString("ar-EG")}</span>
                {autoReload && autoUpdateCountdown > 0 && (
                  <span className="bg-white/20 px-2 py-1 rounded">
                    التحديث التالي خلال: {formatCountdown(autoUpdateCountdown)}
                  </span>
                )}
              </div>
            )}
          </CardHeader>
        </Card>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className={'grid w-full grid-cols-4 ${darkMode ? 'bg-gray-800' : 'bg-white'}'}>
            <TabsTrigger value="posts" className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4" />
              المنشورات
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              التحليلات
            </TabsTrigger>
            <TabsTrigger value="customers" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              العملاء
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Filter className="w-4 h-4" />
              الإعدادات
            </TabsTrigger>
          </TabsList>

          {/* Posts Tab */}
          <TabsContent value="posts" className="space-y-6">
            {/* File Upload Section */}
            <Card className={'shadow-lg border-0 ${darkMode ? 'bg-gray-800' : 'bg-white/80'} backdrop-blur-sm'}>
              <CardContent className="space-y-6 p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="tokenFile" className={'flex items-center gap-2 font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}'}>
                      <Upload className="w-4 h-4" />📄 ملف التوكن
                    </Label>
                    <Input
                      id="tokenFile"
                      type="file"
                      accept=".txt"
                      ref={tokenFileRef}
                      onChange={handleTokenFile}
                      className="border-2 border-dashed border-gray-300 hover:border-blue-400 transition-colors"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="groupFile" className={'flex items-center gap-2 font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}'}>
                      <Upload className="w-4 h-4" />📄 ملف الجروبات
                    </Label>
                    <Input
                      id="groupFile"
                      type="file"
                      accept=".txt"
                      ref={groupFileRef}
                      onChange={handleGroupFile}
                      className="border-2 border-dashed border-gray-300 hover:border-blue-400 transition-colors"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phoneFile" className={'flex items-center gap-2 font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}'}>
                      <Upload className="w-4 h-4" />📄 ملف المستخدمين
                    </Label>
                    <Input
                      id="phoneFile"
                      type="file"
                      accept=".json"
                      ref={phoneFileRef}
                      onChange={handlePhoneFile}
                      className="border-2 border-dashed border-gray-300 hover:border-blue-400 transition-colors"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="keywordFile" className={'flex items-center gap-2 font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}'}>
                      <Upload className="w-4 h-4" />🔍 ملف الكلمات المفتاحية
                    </Label>
                    <Input
                      id="keywordFile"
                      type="file"
                      accept=".txt,.json"
                      ref={keywordFileRef}
                      onChange={handleKeywordFile}
                      className="border-2 border-dashed border-gray-300 hover:border-blue-400 transition-colors"
                    />
                  </div>
                </div>

                {loadingStatus && (
                  <div className={'text-center p-4 rounded-lg border ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-300' : 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 text-blue-800'}'}>
                    <p className="font-medium">{loadingStatus}</p>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-3 justify-center">
                  <Button
                    onClick={loadAllPosts}
                    disabled={loading}
                    className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                  >
                    <RefreshCw className={'w-4 h-4 ${loading ? "animate-spin" : ""}'} />
                    {loading ? "جاري التحميل..." : "🔁 تحميل المنشورات"}
                  </Button>

                  <Button
                    onClick={downloadCSV}
                    variant="outline"
                    className="flex items-center gap-2 border-2 hover:bg-green-50 hover:border-green-400 bg-transparent"
                  >
                    <Download className="w-4 h-4" />
                    ⬇️ تحميل CSV
                  </Button>

                  <Button
                    onClick={() => setAutoReload(!autoReload)}
                    variant={autoReload ? "destructive" : "secondary"}
                    className="flex items-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    {autoReload ? "إيقاف التحديث التلقائي" : "تفعيل التحديث التلقائي"}
                  </Button>

                  <Button
                    onClick={testAccessToken}
                    variant="outline"
                    className="flex items-center gap-2 border-2 hover:bg-yellow-50 hover:border-yellow-400 bg-transparent"
                  >
                    🔑 اختبار التوكن
                  </Button>
                </div>

                {/* Advanced Filters */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t">
                  <div className="space-y-2">
                    <Label className={'text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}'}>فلترة بالتاريخ</Label>
                    <Select value={dateFilter} onValueChange={setDateFilter}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">جميع التواريخ</SelectItem>
                        <SelectItem value="today">اليوم</SelectItem>
                        <SelectItem value="week">آخر أسبوع</SelectItem>
                        <SelectItem value="month">آخر شهر</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className={'text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}'}>الحد الأدنى للنقاط</Label>
                    <Input
                      type="number"
                      value={scoreFilter}
                      onChange={(e) => setScoreFilter(Number(e.target.value))}
                      min="0"
                      max="100"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className={'text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}'}>بحث متقدم</Label>
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={regexSearch}
                        onCheckedChange={setRegexSearch}
                      />
                      <span className="text-sm">Regex</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className={'text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}'}>المنشورات المحفوظة</Label>
                    <Badge variant="secondary" className="w-full justify-center">
                      {savedPosts.size} منشور محفوظ
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <Input
                type="text"
                placeholder="🔍 ابحث في المنشورات والتعليقات..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={'pr-12 h-12 text-lg border-2 focus:border-blue-500 rounded-xl shadow-sm ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'border-gray-300'}'}
              />
            </div>

            {/* Posts List */}
            <div className="space-y-6">
              {filteredPosts.map((post, index) => (
                <Card
                  key={'${post.id}-${index}'}
                  className={'overflow-hidden shadow-lg border-0 hover:shadow-xl transition-shadow ${darkMode ? 'bg-gray-800' : 'bg-white/90'} backdrop-blur-sm'}
                  ref={index === filteredPosts.length - 1 ? lastPostElementRef : null}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4 mb-4">
                      <Avatar className="w-14 h-14 ring-2 ring-blue-200">
                        <AvatarImage src={post.from?.picture?.data?.url || "/placeholder.svg"} />
                        <AvatarFallback className="bg-gradient-to-r from-blue-500 to-indigo-500 text-white">
                          <User className="w-7 h-7" />
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <User className="w-4 h-4 text-blue-600" />
                          <span className={'font-bold text-lg ${darkMode ? 'text-white' : 'text-gray-800'}'}>
                            {post.from?.name || "غير معروف"}
                          </span>
                          
                          {/* Score Badge */}
                          <Badge variant="secondary" className="bg-purple-100 text-purple-800">
                            <TrendingUp className="w-3 h-3 mr-1" />
                            {calculatePostScore(post)} نقطة
                          </Badge>

                          {allPostsData.find((p) => p.authorId === post.from?.id)?.hasImages && (
                            <Badge variant="secondary" className="bg-green-100 text-green-700">
                              <ImageIcon className="w-3 h-3 mr-1" />
                              صور
                            </Badge>
                          )}
                          
                          {(post.comments?.data?.length || 0) > 0 && (
                            <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                              <MessageCircle className="w-3 h-3 mr-1" />
                              {post.comments?.data?.length} تعليق
                            </Badge>
                          )}

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleSavePost(post.id)}
                            className="ml-auto"
                          >
                            {savedPosts.has(post.id) ? (
                              <Star className="w-4 h-4 text-yellow-500 fill-current" />
                            ) : (
                              <StarOff className="w-4 h-4 text-gray-400" />
                            )}
                          </Button>
                        </div>

                        <div className="flex items-center gap-6 text-sm text-gray-600 mb-3">
                          <div className="flex items-center gap-2">
                            <Phone className="w-4 h-4 text-red-500" />
                            {allPostsData.find((p) => p.authorId === post.from?.id)?.phone === "اضغط للبحث" ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => searchSinglePhone(post.from?.id || "", post.from?.name || "", false)}
                                className="text-xs h-7 px-3 bg-gradient-to-r from-red-50 to-pink-50 border-red-200 hover:from-red-100 hover:to-pink-100"
                                disabled={searchingPhones.has(post.from?.id || "")}
                              >
                                {searchingPhones.has(post.from?.id || "") ? <>⏳ جاري البحث...</> : <>🔍 البحث عن الرقم</>}
                              </Button>
                            ) : (
                              <span className="font-bold text-red-600 bg-red-50 px-2 py-1 rounded">
                                {allPostsData.find((p) => p.authorId === post.from?.id)?.phone || "غير معروف"}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4 text-blue-500" />
                            <span>{new Date(post.created_time).toLocaleString("ar-EG")}</span>
                          </div>

                          {post.from?.id && (
                            <a
                              href={'https://facebook.com/${post.from.id}'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                            >
                              <ExternalLink className="w-4 h-4" />
                              زيارة البروفايل
                            </a>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mb-4">
                      <p className={'leading-relaxed text-lg ${darkMode ? 'text-gray-300' : 'text-gray-800'}'}>
                        {post.message || "بدون محتوى نصي"}
                      </p>
                    </div>

                    {getPostImages(post).length > 0 && (
                      <div className="mb-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {getPostImages(post).map((imageUrl, imgIndex) => (
                            <div key={imgIndex} className="relative group">
                              <img
                                src={imageUrl || "/placeholder.svg"}
                                alt={'صورة ${imgIndex + 1}'}
                                className="w-full h-48 object-cover rounded-lg shadow-md group-hover:shadow-lg transition-shadow cursor-pointer"
                                onClick={() => window.open(imageUrl, "_blank")}
                              />
                              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all rounded-lg flex items-center justify-center">
                                <ExternalLink className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Post Actions */}
                    <div className="flex items-center justify-between mb-4 pt-2 border-t border-gray-100">
                      <div className="flex items-center gap-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const groupId = groupIds.find((id) => {
                              const postData = allPostsData.find((p) => p.authorId === post.from?.id)
                              return postData?.groupId.includes(id) || postData?.groupId === id
                            })
                            const postId = post.id.split("_")[1] || post.id
                            window.open('https://facebook.com/groups/${groupId}/posts/${postId}', "_blank")
                          }}
                          className="flex items-center gap-2 bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 hover:from-green-100 hover:to-emerald-100 text-green-700"
                        >
                          <ExternalLink className="w-4 h-4" />🔗 فتح المنشور الأصلي
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const postUrl = 'https://facebook.com/groups/${groupIds.find((id) => {
                              const postData = allPostsData.find((p) => p.authorId === post.from?.id)
                              return postData?.groupId.includes(id) || postData?.groupId === id
                            })}/posts/${post.id.split("_")[1] || post.id}'
                            navigator.clipboard.writeText(postUrl)
                            setLoadingStatus("📋 تم نسخ رابط المنشور")
                          }}
                          className="flex items-center gap-2 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 hover:from-blue-100 hover:to-indigo-100 text-blue-700"
                        >
                          📋 نسخ الرابط
                        </Button>
                      </div>

                      <div className={'text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}'}>
                        معرف المنشور: {post.id}
                      </div>
                    </div>

                    {/* Comments Section */}
                    {post.comments?.data && post.comments.data.length > 0 && (
                      <>
                        <Separator className="my-4" />
                        <div className={'rounded-lg p-4 ${darkMode ? 'bg-gray-700' : 'bg-gradient-to-r from-gray-50 to-blue-50'}'}>
                          <div className="flex items-center justify-between mb-4">
                            <h4 className={'font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-800'}'}>
                              💬 التعليقات ({post.comments.data.length})
                            </h4>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleComments(post.id)}
                              className="flex items-center gap-1"
                            >
                              {expandedComments.has(post.id) ? (
                                <>
                                  <ChevronUp className="w-4 h-4" />
                                  إخفاء
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="w-4 h-4" />
                                  عرض
                                </>
                              )
                            </Button>
                          </div>

                          {expandedComments.has(post.id) && (
                            <div className="space-y-4">
                              {post.comments.data.map((comment, commentIndex) => (
                                <div
                                  key={'${comment.id}-${commentIndex}'}
                                  className={'rounded-lg p-3 shadow-sm border ${darkMode ? 'bg-gray-600 border-gray-500' : 'bg-white border-gray-100'}'}
                                >
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                      <span className={'font-semibold text-sm ${darkMode ? 'text-white' : 'text-gray-800'}'}>
                                        {comment.from?.name || "مجهول"}
                                      </span>
                                      <span className={'text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}'}>
                                        🕓 {new Date(comment.created_time).toLocaleString("ar-EG")}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Phone className="w-3 h-3 text-red-500" />
                                      {allCommentsData.find((c) => c.commentId === comment.id)?.phone === "اضغط للبحث" ? (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() =>
                                            searchSinglePhone(comment.from?.id || "", comment.from?.name || "", true)
                                          }
                                          className="text-xs h-6 px-2 bg-gradient-to-r from-red-50 to-pink-50 border-red-200"
                                          disabled={searchingPhones.has(comment.from?.id || "")}
                                        >
                                          {searchingPhones.has(comment.from?.id || "") ? <>⏳</> : <>🔍</>}
                                        </Button>
                                      ) : (
                                        <span className="text-xs font-bold text-red-600 bg-red-50 px-1 py-0.5 rounded">
                                          {allCommentsData.find((c) => c.commentId === comment.id)?.phone || "غير معروف"}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <p className={'text-sm leading-relaxed ${darkMode ? 'text-gray-300' : 'text-gray-700'}'}>
                                    {comment.message}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              ))}

              {loadingMore && (
                <Card className={'shadow-lg border-0 ${darkMode ? 'bg-gray-800' : 'bg-white/90'} backdrop-blur-sm'}>
                  <CardContent className="text-center py-8">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
                    <p className={darkMode ? 'text-gray-300' : 'text-gray-600'}>جاري تحميل منشورات أقدم...</p>
                  </CardContent>
                </Card>
              )}

              {filteredPosts.length === 0 && !loading && (
                <Card className={'shadow-lg border-0 ${darkMode ? 'bg-gray-800' : 'bg-white/90'} backdrop-blur-sm'}>
                  <CardContent className="text-center py-12">
                    <div className="text-6xl mb-4">📭</div>
                    <p className={'text-lg ${darkMode ? 'text-gray-400' : 'text-gray-500'}'}>لا توجد منشورات للعرض</p>
                    <p className={'text-sm mt-2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}'}>
                      جرب تحميل المنشورات أو تغيير كلمة البحث
                    </p>
                  </CardContent>
                </Card>
              )}

              <div ref={loadMoreRef} className="h-10" />
            </div>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className={'${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-lg'}>
                <CardContent className="p-6 text-center">
                  <div className="text-3xl font-bold text-blue-600">{analytics.totalPosts}</div>
                  <div className={'text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}'}>إجمالي المنشورات</div>
                </CardContent>
              </Card>

              <Card className={'${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-lg'}>
                <CardContent className="p-6 text-center">
                  <div className="text-3xl font-bold text-green-600">{analytics.highScorePosts}</div>
                  <div className={'text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}'}>منشورات عالية الجودة</div>
                </CardContent>
              </Card>

              <Card className={'${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-lg'}>
                <CardContent className="p-6 text-center">
                  <div className="text-3xl font-bold text-purple-600">{analytics.totalCustomers}</div>
                  <div className={'text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}'}>عملاء محتملين</div>
                </CardContent>
              </Card>

              <Card className={'${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-lg'}>
                <CardContent className="p-6 text-center">
                  <div className="text-3xl font-bold text-orange-600">{analytics.todayPosts}</div>
                  <div className={'text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}'}>منشورات اليوم</div>
                </CardContent>
              </Card>
            </div>

            {/* Keyword Performance */}
            <Card className={'${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-lg'}>
              <CardHeader>
                <CardTitle className={'flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-800'}'}>
                  <Target className="w-5 h-5" />
                  أداء الكلمات المفتاحية
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {analytics.keywordStats.slice(0, 10).map((stat, index) => (
                    <div key={stat.keyword} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="w-8 h-8 rounded-full flex items-center justify-center">
                          {index + 1}
                        </Badge>
                        <span className={'font-medium ${darkMode ? 'text-white' : 'text-gray-800'}'}>{stat.keyword}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={'w-32 h-2 rounded-full ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}'}>
                          <div
                            className="h-2 bg-blue-500 rounded-full"
                            style={{ width: '${Math.min((stat.count / analytics.totalPosts) * 100, 100)}%' }}
                          />
                        </div>
                        <span className={'text-sm font-bold ${darkMode ? 'text-gray-300' : 'text-gray-600'}'}>
                          {stat.count}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Customers Tab */}
          <TabsContent value="customers" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className={'text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}'}>إدارة العملاء المحتملين</h2>
              <Button onClick={downloadCustomersReport} className="flex items-center gap-2">
                <Download className="w-4 h-4" />
                تحميل تقرير العملاء
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {['interested', 'contacted', 'converted', 'not_interested'].map((status) => (
                <Card key={status} className={'${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-lg'}>
                  <CardContent className="p-4 text-center">
                    <div className="flex items-center justify-center mb-2">
                      {status === 'interested' && <AlertCircle className="w-6 h-6 text-yellow-500" />}
                      {status === 'contacted' && <Phone className="w-6 h-6 text-blue-500" />}
                      {status === 'converted' && <CheckCircle className="w-6 h-6 text-green-500" />}
                      {status === 'not_interested' && <XCircle className="w-6 h-6 text-red-500" />}
                    </div>
                    <div className="text-2xl font-bold">
                      {customers.filter(c => c.status === status).length}
                    </div>
                    <div className={'text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}'}>
                      {status === 'interested' && 'مهتم'}
                      {status === 'contacted' && 'تم التواصل'}
                      {status === 'converted' && 'تم التحويل'}
                      {status === 'not_interested' && 'غير مهتم'}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Customers List */}
            <Card className={'${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-lg'}>
              <CardHeader>
                <CardTitle className={darkMode ? 'text-white' : 'text-gray-800'}>قائمة العملاء</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {customers.sort((a, b) => b.score - a.score).slice(0, 20).map((customer) => (
                    <div
                      key={customer.id}
                      className={'p-4 rounded-lg border cursor-pointer hover:shadow-md transition-shadow ${
                        darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'
                      }'}
                      onClick={() => setSelectedCustomer(customer)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar className="w-10 h-10">
                            <AvatarFallback className="bg-blue-500 text-white">
                              {customer.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className={'font-semibold ${darkMode ? 'text-white' : 'text-gray-800'}'}>
                              {customer.name}
                            </div>
                            <div className={'text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}'}>
                              {customer.phone || 'لا يوجد رقم'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="bg-purple-100 text-purple-800">
                            {customer.score} نقطة
                          </Badge>
                          <Badge
                            variant={
                              customer.status === 'converted' ? 'default' :
                              customer.status === 'contacted' ? 'secondary' :
                              customer.status === 'interested' ? 'outline' : 'destructive'
                            }
                          >
                            {customer.status === 'interested' && 'مهتم'}
                            {customer.status === 'contacted' && 'تم التواصل'}
                            {customer.status === 'converted' && 'تم التحويل'}
                            {customer.status === 'not_interested' && 'غير مهتم'}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            {/* Keyword Filter Management */}
            <Card className={'${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-lg'}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className={'text-lg flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-800'}'}>
                    🎯 إدارة الكلمات المفتاحية
                    <Badge variant={filterEnabled ? "default" : "secondary"}>{filterEnabled ? "مفعل" : "معطل"}</Badge>
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => setFilterEnabled(!filterEnabled)}
                      variant={filterEnabled ? "destructive" : "default"}
                      size="sm"
                    >
                      {filterEnabled ? "إلغاء الفلترة" : "تفعيل الفلترة"}
                    </Button>
                    <Button onClick={() => setShowKeywordManager(!showKeywordManager)} variant="outline" size="sm">
                      {showKeywordManager ? "إخفاء الإدارة" : "إدارة الكلمات"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <p className={'text-sm mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}'}>
                    الكلمات المفتاحية الحالية ({keywordFilters.length}):
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {keywordFilters.map((keyword, index) => (
                      <Badge
                        key={index}
                        variant="secondary"
                        className="bg-blue-100 text-blue-800 hover:bg-blue-200 cursor-pointer"
                        onClick={() => showKeywordManager && removeKeyword(keyword)}
                      >
                        {keyword}
                        {showKeywordManager && <span className="ml-1">×</span>}
                      </Badge>
                    ))}
                  </div>
                </div>

                {showKeywordManager && (
                  <div className="space-y-4 border-t pt-4">
                    <div className="flex gap-2">
                      <Input
                        placeholder="أضف كلمة مفتاحية جديدة..."
                        value={newKeyword}
                        onChange={(e) => setNewKeyword(e.target.value)}
                        onKeyPress={(e) => e.key === "Enter" && addKeyword()}
                        className="flex-1"
                      />
                      <Button onClick={addKeyword} disabled={!newKeyword.trim()}>
                        إضافة
                      </Button>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={downloadKeywords}
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-1 bg-transparent"
                      >
                        <Download className="w-4 h-4" />
                        تحميل الكلمات
                      </Button>
                      <Button
                        onClick={() => {
                          setKeywordFilters([])
                          setLoadingStatus("🗑️ تم مسح جميع الكلمات المفتاحية")
                        }}
                        variant="destructive"
                        size="sm"
                      >
                        مسح الكل
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* App Settings */}
            <Card className={'${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-lg'}>
              <CardHeader>
                <CardTitle className={darkMode ? 'text-white' : 'text-gray-800'}>إعدادات التطبيق</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className={'text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}'}>
                      الوضع الليلي
                    </Label>
                    <p className={'text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}'}>
                      تفعيل الوضع الليلي لراحة العينين
                    </p>
                  </div>
                  <Switch checked={darkMode} onCheckedChange={setDarkMode} />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className={'text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}'}>
                      الإشعارات
                    </Label>
                    <p className={'text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}'}>
                      تلقي إشعارات للمنشورات المهمة
                    </p>
                  </div>
                  <Switch checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className={'text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}'}>
                      التحديث التلقائي
                    </Label>
                    <p className={'text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}'}>
                      تحديث المنشورات تلقائياً كل 5 دقائق
                    </p>
                  </div>
                  <Switch checked={autoReload} onCheckedChange={setAutoReload} />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className={'text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}'}>
                      البحث المتقدم (Regex)
                    </Label>
                    <p className={'text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}'}>
                      استخدام التعبيرات النمطية في البحث
                    </p>
                  </div>
                  <Switch checked={regexSearch} onCheckedChange={setRegexSearch} />
                </div>
              </CardContent>
            </Card>

            {/* Statistics */}
            {posts.length > 0 && (
              <Card className={'${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-lg'}>
                <CardHeader>
                  <CardTitle className={darkMode ? 'text-white' : 'text-gray-800'}>إحصائيات التطبيق</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-4 rounded-lg text-center">
                      <div className="text-2xl font-bold">{analytics.totalPosts}</div>
                      <div className="text-sm">إجمالي المنشورات</div>
                    </div>
                    <div className="bg-gradient-to-r from-green-500 to-green-600 text-white p-4 rounded-lg text-center">
                      <div className="text-2xl font-bold">{filteredPosts.length}</div>
                      <div className="text-sm">منشورات مفلترة</div>
                    </div>
                    <div className="bg-gradient-to-r from-purple-500 to-purple-600 text-white p-4 rounded-lg text-center">
                      <div className="text-2xl font-bold">{analytics.totalComments}</div>
                      <div className="text-sm">تعليق</div>
                    </div>
                    <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 text-white p-4 rounded-lg text-center">
                      <div className="text-2xl font-bold">{analytics.postsWithImages}</div>
                      <div className="text-sm">منشور بصور</div>
                    </div>
                    <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white p-4 rounded-lg text-center">
                      <div className="text-2xl font-bold">{groupIds.length}</div>
                      <div className="text-sm">جروب</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
