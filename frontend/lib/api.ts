/**
 * DevPulse Frontend API Client
 * Base client handling API calls to FastAPI backend with CORS/Credentials.
 */

export const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "https://13.126.205.138.nip.io";

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(status: number, message: string, data?: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorDetail = `Request failed with status ${res.status}`;
    let data: any = null;
    try {
      data = await res.json();
      if (data && data.detail) {
        errorDetail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
      }
    } catch (_) {
      // response wasn't JSON
    }
    throw new ApiError(res.status, errorDetail, data);
  }
  if (res.status === 204) {
    return {} as T;
  }
  return res.json();
}

export async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
  const headers = new Headers(options.headers || {});

  if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // Fallback for Incognito mode where cross-site cookies are blocked by browser
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("devpulse_access_token");
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: "include", // send httpOnly cookies
  });

  return handleResponse<T>(res);
}

export async function apiGet<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
  let url = endpoint;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null) {
        searchParams.append(key, String(val));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += (url.includes("?") ? "&" : "?") + queryString;
    }
  }
  return apiFetch<T>(url, { method: "GET" });
}

export async function apiPost<T>(endpoint: string, body?: any): Promise<T> {
  return apiFetch<T>(endpoint, {
    method: "POST",
    body: body instanceof FormData ? body : JSON.stringify(body),
  });
}

export async function apiPut<T>(endpoint: string, body?: any): Promise<T> {
  return apiFetch<T>(endpoint, {
    method: "PUT",
    body: body instanceof FormData ? body : JSON.stringify(body),
  });
}

export async function apiPatch<T>(endpoint: string, body?: any): Promise<T> {
  return apiFetch<T>(endpoint, {
    method: "PATCH",
    body: body instanceof FormData ? body : JSON.stringify(body),
  });
}

export async function apiDelete<T>(endpoint: string): Promise<T> {
  return apiFetch<T>(endpoint, { method: "DELETE" });
}

// ── Models & Interfaces ───────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  username: string;
  full_name: string;
  role: string;
  is_active: boolean;
  is_verified: boolean;
  avatar_url?: string | null;
  bio?: string | null;
  website?: string | null;
  github_username?: string | null;
  twitter_username?: string | null;
  is_private?: boolean;
  follower_count?: number;
  following_count?: number;
  created_at: string;
}

export interface AuthResponse {
  message?: string;
  user?: User;
  detail?: string;
}

export interface AuthorResponse {
  id: string;
  username: string;
  full_name: string;
  avatar_url?: string | null;
  role?: string;
}

export interface PostResponse {
  id: string;
  title: string;
  content: string;
  image_url?: string | null;
  author_id: string;
  author: AuthorResponse;
  likes_count: number;
  comments_count: number;
  is_liked?: boolean;
  is_reposted?: boolean;
  original_post_id?: string | null;
  is_archived?: boolean;
  created_at: string;
  repost_id?: string | null;
  original_post?: PostResponse | null;
}

export interface CommentResponse {
  id: string;
  content: string;
  author: AuthorResponse;
  created_at: string;
}

export interface PostDetailResponse extends PostResponse {
  comments: CommentResponse[];
}

export interface UserProfileResponse {
  id?: string;
  username: string;
  full_name: string;
  avatar_url?: string | null;
  bio?: string | null;
  created_at: string;
  followers_count: number;
  following_count: number;
  is_following?: boolean;
  is_private?: boolean;
  has_pending_request?: boolean;
  has_pending_follow_request?: boolean;
  is_blocked_by_me?: boolean;
  has_blocked_me?: boolean;
  posts_count?: number;
  user?: User;
}

export interface ExploreUser extends AuthorResponse {
  bio?: string | null;
  is_private?: boolean;
  is_following?: boolean;
  has_pending_request?: boolean;
}

export interface ExploreUsersResponse {
  users: ExploreUser[];
  total: number;
  has_more: boolean;
}

export type ToggleFollowStatusType = "followed" | "unfollowed" | "requested" | "request_cancelled";

export interface ToggleFollowStatus {
  status: ToggleFollowStatusType;
  is_following?: boolean;
}

export interface BlockedUser {
  id: string;
  username: string;
  full_name: string;
  avatar_url?: string | null;
  blocked_at: string;
}

export interface FollowRequestResponse {
  id: string;
  requester: AuthorResponse;
  created_at: string;
}

export interface ConversationResponse {
  conversation_id: string;
  id?: string;
  name?: string | null;
  is_group: boolean;
  participants: AuthorResponse[];
  is_blocked?: boolean;
  unread_count?: number;
  last_message?: string | null;
  last_message_id?: string | null;
  last_message_msg_type?: string | null;
  last_message_encrypted?: boolean;
  last_message_at?: string;
  updated_at?: string;
}

export interface ChatMessageResponse {
  id: string;
  conversation_id: string;
  sender_id: string;
  content?: string | null;
  ciphertext?: string;
  iv?: string;
  msg_type?: string | null;
  image_url?: string | null;
  is_read?: boolean;
  created_at: string;
  reactions?: Array<{ user_id: string; emoji: string }>;
}

// ── Admin Interfaces ──────────────────────────────────────────────────────────

export interface DailyCount {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface AdminStatsResponse {
  total_users: number;
  total_posts: number;
  active_posts: number;
  archived_posts: number;
  total_likes: number;
  total_comments: number;
  new_signups_7d: number;
  new_signups_30d: number;
  signups_per_day: DailyCount[];
  posts_per_day: DailyCount[];
}

export interface AdminUserOut {
  id: string;
  email: string;
  username: string;
  full_name: string;
  role: "user" | "admin" | "superadmin";
  is_active: boolean;
  is_verified: boolean;
  avatar_url?: string | null;
  created_at: string;
  permissions: string[];
}

export interface AdminUserListResponse {
  items: AdminUserOut[];
  total: number;
  skip: number;
  limit: number;
}

export interface AdminPostOut {
  id: string;
  title?: string | null;
  content?: string | null;
  image_url?: string | null;
  author_id: string;
  author_username: string;
  is_archived: boolean;
  likes_count: number;
  comments_count: number;
  created_at: string;
}

export interface AdminPostListResponse {
  items: AdminPostOut[];
  total: number;
  skip: number;
  limit: number;
}

export interface AdminUserRoleUpdate {
  role: string;
}

export interface AdminPostUpdate {
  title?: string | null;
  content?: string | null;
  is_archived?: boolean | null;
}

export interface AdminPermissionOut {
  user_id: string;
  permissions: string[];
}

export const ALL_PERMISSIONS = [
  { key: "view_stats",   label: "View Dashboard Stats" },
  { key: "view_users",   label: "View Users" },
  { key: "manage_users", label: "Manage Users (block/unblock/promote)" },
  { key: "view_posts",   label: "View Posts" },
  { key: "edit_posts",   label: "Edit Posts (archive/unarchive/edit)" },
  { key: "delete_posts", label: "Delete Posts" },
] as const;

// ── Authentication API Functions ─────────────────────────────────────────────

export async function login(email: string, password: string): Promise<AuthResponse> {
  return apiPost<AuthResponse>("/auth/login", { email, password });
}

export async function register(full_name: string, email: string, password: string): Promise<AuthResponse> {
  return apiPost<AuthResponse>("/auth/register", { full_name, email, password });
}

export async function logout(): Promise<{ message: string }> {
  return apiPost<{ message: string }>("/auth/logout");
}

export async function verifyOtp(email: string, code: string): Promise<AuthResponse> {
  return apiPost<AuthResponse>("/auth/verify-otp", { email, code });
}

export async function resendOtp(email: string): Promise<{ message: string }> {
  return apiPost<{ message: string }>("/auth/resend-otp", { email });
}

export async function getMe(): Promise<User> {
  return apiGet<User>("/auth/me");
}

// ── Profile & User API Functions ─────────────────────────────────────────────

export async function getProfile(): Promise<User> {
  return apiGet<User>("/auth/me");
}

export async function getUserProfile(username: string): Promise<UserProfileResponse> {
  return apiGet<UserProfileResponse>(`/users/${username}`);
}

export async function updateProfile(data: Partial<User>): Promise<User> {
  return apiPatch<User>("/users/me/profile", data);
}

export async function uploadAvatar(fileOrFormData: File | FormData): Promise<{ avatar_url: string }> {
  let formData: FormData;
  if (fileOrFormData instanceof FormData) {
    formData = fileOrFormData;
    if (formData.has("file") && !formData.has("image")) {
      const f = formData.get("file");
      if (f) formData.append("image", f);
    }
  } else {
    formData = new FormData();
    formData.append("image", fileOrFormData);
  }
  return apiPost<{ avatar_url: string }>("/users/me/avatar", formData);
}

export async function updatePrivacy(is_private: boolean): Promise<User> {
  return apiPatch<User>("/users/me/privacy", { is_private });
}

export async function searchUsers(query: string): Promise<AuthorResponse[]> {
  return apiGet<AuthorResponse[]>("/users/search", { q: query });
}

export async function getExploreUsers(skip = 0, limit = 20): Promise<ExploreUsersResponse> {
  return apiGet<ExploreUsersResponse>("/users/explore", { skip, limit });
}

export async function toggleFollow(username: string): Promise<ToggleFollowStatus> {
  return apiPost<ToggleFollowStatus>(`/users/${username}/follow`);
}

export async function getBlockedUsers(): Promise<BlockedUser[]> {
  return apiGet<BlockedUser[]>("/users/me/blocked");
}

export async function toggleBlock(username: string): Promise<{ is_blocked: boolean }> {
  return apiPost<{ is_blocked: boolean }>(`/users/${username}/block`);
}

export async function getFollowRequests(): Promise<FollowRequestResponse[]> {
  return apiGet<FollowRequestResponse[]>("/users/me/follow-requests");
}

export async function acceptFollowRequest(requestId: string): Promise<{ message: string }> {
  return apiPost<{ message: string }>(`/users/follow-requests/${requestId}/accept`);
}

export async function rejectFollowRequest(requestId: string): Promise<{ message: string }> {
  return apiPost<{ message: string }>(`/users/follow-requests/${requestId}/reject`);
}

// ── Posts API Functions ───────────────────────────────────────────────────────

export async function getPosts(
  usernameOrOptions?: string | { username?: string; include_archived?: boolean; skip?: number; limit?: number },
  includeArchived?: boolean,
  skip?: number,
  limit?: number
): Promise<PostResponse[]> {
  let params: Record<string, any> = {};
  if (typeof usernameOrOptions === "object" && usernameOrOptions !== null) {
    params = usernameOrOptions;
  } else {
    if (usernameOrOptions) params.username = usernameOrOptions;
    if (includeArchived !== undefined) params.include_archived = includeArchived;
    if (skip !== undefined) params.skip = skip;
    if (limit !== undefined) params.limit = limit;
  }
  return apiGet<PostResponse[]>("/posts", params);
}

export async function getPost(id: string): Promise<PostDetailResponse> {
  return apiGet<PostDetailResponse>(`/posts/${id}`);
}

export async function createPost(data: { title: string; content: string; image_url?: string }): Promise<PostResponse> {
  return apiPost<PostResponse>("/posts", data);
}

export async function updatePost(id: string, data: { title?: string; content?: string }): Promise<PostResponse> {
  return apiPatch<PostResponse>(`/posts/${id}`, data);
}

export async function deletePost(id: string): Promise<{ message: string }> {
  return apiDelete<{ message: string }>(`/posts/${id}`);
}

export async function toggleLike(id: string): Promise<{ is_liked: boolean; likes_count: number }> {
  return apiPost<{ is_liked: boolean; likes_count: number }>(`/posts/${id}/like`);
}

export async function repostPost(id: string): Promise<PostResponse> {
  return apiPost<PostResponse>(`/posts/${id}/repost`);
}

export async function archivePost(id: string): Promise<PostResponse> {
  return apiPost<PostResponse>(`/posts/${id}/archive`);
}

export async function unarchivePost(id: string): Promise<PostResponse> {
  return apiPost<PostResponse>(`/posts/${id}/unarchive`);
}

export async function addComment(postId: string, content: string): Promise<CommentResponse> {
  return apiPost<CommentResponse>(`/posts/${postId}/comments`, { content });
}

// ── Chat & E2EE API Functions ─────────────────────────────────────────────────

export async function getConversations(): Promise<ConversationResponse[]> {
  return apiGet<ConversationResponse[]>("/chat/conversations");
}

export async function getChatHistory(conversationId: string, limit = 50, before?: string): Promise<ChatMessageResponse[]> {
  return apiGet<ChatMessageResponse[]>(`/chat/${conversationId}`, { limit, before });
}

export async function startDirectConversation(recipientUsername: string): Promise<ConversationResponse> {
  return apiPost<ConversationResponse>("/chat/conversations/direct", { username: recipientUsername });
}

export async function createGroupConversation(name: string, participantUsernames: string[]): Promise<ConversationResponse> {
  return apiPost<ConversationResponse>("/chat/conversations/group", { name, usernames: participantUsernames });
}

export async function hideConversation(conversationId: string): Promise<{ message: string }> {
  try {
    return await apiDelete<{ message: string }>(`/chat/conversations/${conversationId}`);
  } catch (_) {
    return { message: "hidden" };
  }
}

export async function markConversationRead(conversationId: string): Promise<{ marked_read: number }> {
  return apiPost<{ marked_read: number }>(`/chat/${conversationId}/read`);
}

export async function uploadChatImage(fileOrFormData: File | FormData): Promise<{ image_url: string }> {
  let formData: FormData;
  if (fileOrFormData instanceof FormData) {
    formData = fileOrFormData;
  } else {
    formData = new FormData();
    formData.append("image", fileOrFormData);
  }
  return apiPost<{ image_url: string }>("/chat/upload_image", formData);
}

export async function uploadKeyBundle(bundle: any): Promise<{ message: string }> {
  return apiPost<{ message: string }>("/chat/keys", bundle);
}

export async function getKeyBundle(userId: string): Promise<any> {
  return apiGet<any>(`/chat/keys/${userId}`);
}

// ── Admin API Functions ───────────────────────────────────────────────────────

export async function getAdminStats(): Promise<AdminStatsResponse> {
  return apiGet<AdminStatsResponse>("/admin/stats");
}

export async function getAdminUsers(params: { search?: string; skip?: number; limit?: number }): Promise<AdminUserListResponse> {
  return apiGet<AdminUserListResponse>("/admin/users", params);
}

export async function blockUserAdmin(userId: string): Promise<AdminUserOut> {
  return apiPatch<AdminUserOut>(`/admin/users/${userId}/block`);
}

export async function unblockUserAdmin(userId: string): Promise<AdminUserOut> {
  return apiPatch<AdminUserOut>(`/admin/users/${userId}/unblock`);
}

export async function updateUserRoleAdmin(userId: string, role: string): Promise<AdminUserOut> {
  return apiPatch<AdminUserOut>(`/admin/users/${userId}/role`, { role });
}

export async function getAdminPosts(params: { search?: string; include_archived?: boolean; skip?: number; limit?: number }): Promise<AdminPostListResponse> {
  return apiGet<AdminPostListResponse>("/admin/posts", params);
}

export async function updateAdminPost(postId: string, payload: AdminPostUpdate): Promise<AdminPostOut> {
  return apiPatch<AdminPostOut>(`/admin/posts/${postId}`, payload);
}

export async function deleteAdminPost(postId: string): Promise<{ ok: boolean; deleted_post_id: string }> {
  return apiDelete<{ ok: boolean; deleted_post_id: string }>(`/admin/posts/${postId}`);
}

export async function getAdminUserPermissions(userId: string): Promise<AdminPermissionOut> {
  return apiGet<AdminPermissionOut>(`/admin/users/${userId}/permissions`);
}

export async function updateAdminUserPermissions(userId: string, permissions: string[]): Promise<AdminPermissionOut> {
  // Uses PUT (full replacement), not PATCH
  const res = await fetch(`${BASE_URL}/admin/users/${userId}/permissions`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ permissions }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail || "Failed to update permissions");
  }
  return res.json();
}