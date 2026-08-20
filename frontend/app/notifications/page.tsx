"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  getFollowRequests,
  acceptFollowRequest,
  rejectFollowRequest,
  FollowRequestResponse,
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  NotificationItem,
} from "@/lib/api";
import AppLayout from "@/components/AppLayout";

function timeAgo(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "just now";
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays}d ago`;
}

export default function NotificationsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"all" | "requests">("all");

  // Notifications State
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loadingNotifs, setLoadingNotifs] = useState(true);

  // Follow Requests State
  const [requests, setRequests] = useState<FollowRequestResponse[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchNotifications = () => {
    setLoadingNotifs(true);
    getNotifications()
      .then(setNotifications)
      .catch((err) => console.error("Failed to load notifications", err))
      .finally(() => setLoadingNotifs(false));
  };

  const fetchRequests = () => {
    setLoadingRequests(true);
    getFollowRequests()
      .then(setRequests)
      .catch((err) => console.error("Failed to load follow requests", err))
      .finally(() => setLoadingRequests(false));
  };

  useEffect(() => {
    fetchNotifications();
    fetchRequests();
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (err) {
      console.error("Failed to mark all as read", err);
    }
  };

  const handleNotificationClick = async (notif: NotificationItem) => {
    if (!notif.is_read) {
      try {
        await markNotificationAsRead(notif.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
        );
      } catch (err) {
        console.error("Failed to mark notification read", err);
      }
    }

    if (notif.type === "message") {
      router.push(`/chat?user=${notif.actor.username}`);
    } else if (notif.post_id) {
      router.push(`/feed`);
    } else {
      router.push(`/profile/${notif.actor.username}`);
    }
  };

  const handleDeleteNotification = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await deleteNotification(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.error("Failed to delete notification", err);
    }
  };

  const handleAccept = async (requestId: string) => {
    setProcessingId(requestId);
    try {
      await acceptFollowRequest(requestId);
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch (err) {
      console.error("Failed to accept follow request", err);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (requestId: string) => {
    setProcessingId(requestId);
    try {
      await rejectFollowRequest(requestId);
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch (err) {
      console.error("Failed to reject follow request", err);
    } finally {
      setProcessingId(null);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "like":
        return <span className="material-symbols-outlined text-rose-500 text-[20px]">favorite</span>;
      case "comment":
        return <span className="material-symbols-outlined text-blue-400 text-[20px]">comment</span>;
      case "follow":
        return <span className="material-symbols-outlined text-emerald-400 text-[20px]">person_add</span>;
      case "follow_request":
        return <span className="material-symbols-outlined text-amber-400 text-[20px]">how_to_reg</span>;
      case "message":
        return <span className="material-symbols-outlined text-primary text-[20px]">chat</span>;
      default:
        return <span className="material-symbols-outlined text-primary text-[20px]">notifications</span>;
    }
  };

  const getNotificationText = (notif: NotificationItem) => {
    switch (notif.type) {
      case "like":
        return "liked your post";
      case "comment":
        return "commented on your post";
      case "follow":
        return "started following you";
      case "follow_request":
        return "requested to follow you";
      case "message":
        return "sent you a message";
      default:
        return "interacted with you";
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <AppLayout activeNav="notifications">
      <div className="bg-surface text-on-surface min-h-screen">
        <header className="flex items-center justify-between w-full px-4 md:px-6 h-16 sticky top-0 z-50 bg-surface border-b border-outline-variant">
          <div className="font-headline-sm text-headline-sm font-bold text-on-surface">
            Notifications
          </div>
          {activeTab === "all" && unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="text-xs font-semibold text-primary hover:underline px-2 py-1 rounded transition-colors"
            >
              Mark all as read
            </button>
          )}
        </header>

        {/* Tab Selection */}
        <div className="flex border-b border-outline-variant bg-surface sticky top-16 z-40">
          <button
            onClick={() => setActiveTab("all")}
            className={`flex-1 py-3 text-center text-sm font-bold transition-colors border-b-2 flex items-center justify-center gap-2 ${
              activeTab === "all"
                ? "border-primary text-primary"
                : "border-transparent text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <span>All Notifications</span>
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.2 text-[11px] font-bold bg-primary text-on-primary rounded-full">
                {unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("requests")}
            className={`flex-1 py-3 text-center text-sm font-bold transition-colors border-b-2 flex items-center justify-center gap-2 ${
              activeTab === "requests"
                ? "border-primary text-primary"
                : "border-transparent text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <span>Follow Requests</span>
            {requests.length > 0 && (
              <span className="px-1.5 py-0.2 text-[11px] font-bold bg-amber-500 text-black rounded-full">
                {requests.length}
              </span>
            )}
          </button>
        </div>

        <main className="max-w-2xl mx-auto p-3 sm:p-md lg:p-lg pb-16">
          {activeTab === "all" ? (
            loadingNotifs ? (
              <div className="flex items-center justify-center py-12">
                <span className="material-symbols-outlined animate-spin-slow text-primary text-3xl">
                  progress_activity
                </span>
              </div>
            ) : notifications.length === 0 ? (
              <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-xl text-center">
                <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-2">
                  notifications_off
                </span>
                <h3 className="text-title-md font-bold text-on-surface mb-1">No notifications yet</h3>
                <p className="text-body-md text-on-surface-variant">
                  When other developers like your posts, comment, follow, or message you, it'll show up here.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {notifications.map((notif) => (
                  <div
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className={`relative cursor-pointer border rounded-xl p-3.5 transition-all flex items-start gap-3.5 group hover:border-primary/40 ${
                      notif.is_read
                        ? "bg-surface-container-low border-outline-variant/50 opacity-90"
                        : "bg-surface-container border-primary/30 shadow-sm"
                    }`}
                  >
                    {!notif.is_read && (
                      <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary" />
                    )}

                    {/* Actor Avatar */}
                    <div className="relative shrink-0">
                      <div className="w-11 h-11 rounded-full overflow-hidden bg-surface-container-highest border border-outline-variant/30">
                        {notif.actor.avatar_url ? (
                          <img
                            src={notif.actor.avatar_url}
                            alt={notif.actor.username}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center font-bold text-sm">
                            {(notif.actor.full_name || notif.actor.username).substring(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="absolute -bottom-1 -right-1 bg-surface-container-high rounded-full p-0.5 shadow">
                        {getNotificationIcon(notif.type)}
                      </div>
                    </div>

                    {/* Notification details */}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm">
                        <span className="font-bold text-on-surface hover:underline">
                          {notif.actor.full_name || notif.actor.username}
                        </span>{" "}
                        <span className="text-on-surface-variant">{getNotificationText(notif)}</span>
                      </div>

                      {/* Content snippet */}
                      {notif.post_snippet && (
                        <div className="mt-1 text-xs text-on-surface-variant bg-surface-variant/40 px-2.5 py-1.5 rounded-lg border border-outline-variant/30 line-clamp-2">
                          &ldquo;{notif.post_snippet}&rdquo;
                        </div>
                      )}

                      {notif.comment_snippet && (
                        <div className="mt-1 text-xs text-on-surface-variant bg-surface-variant/40 px-2.5 py-1.5 rounded-lg border border-outline-variant/30 line-clamp-2">
                          &ldquo;{notif.comment_snippet}&rdquo;
                        </div>
                      )}

                      <div className="text-[11px] text-on-surface-variant/70 mt-1">
                        {timeAgo(notif.created_at)}
                      </div>
                    </div>

                    {/* Delete Action */}
                    <button
                      onClick={(e) => handleDeleteNotification(e, notif.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-on-surface-variant hover:text-red-400 rounded transition-all shrink-0"
                      title="Delete notification"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                ))}
              </div>
            )
          ) : (
            /* Follow Requests Tab */
            loadingRequests ? (
              <div className="flex items-center justify-center py-12">
                <span className="material-symbols-outlined animate-spin-slow text-primary text-3xl">
                  progress_activity
                </span>
              </div>
            ) : requests.length === 0 ? (
              <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-xl text-center">
                <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-2">
                  how_to_reg
                </span>
                <h3 className="text-title-md font-bold text-on-surface mb-1">No pending requests</h3>
                <p className="text-body-md text-on-surface-variant">
                  When someone requests to follow you, it'll show up here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {requests.map((req) => (
                  <div
                    key={req.id}
                    className="bg-surface-container-low border border-outline-variant rounded-xl p-md flex items-center justify-between gap-4"
                  >
                    <Link
                      href={`/profile/${req.requester.username}`}
                      className="flex items-center gap-3 min-w-0 flex-1"
                    >
                      <div className="w-11 h-11 rounded-full overflow-hidden bg-surface-container-highest shrink-0 border border-outline-variant/30">
                        {req.requester.avatar_url ? (
                          <img
                            src={req.requester.avatar_url}
                            alt={req.requester.username}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center font-bold">
                            {(req.requester.full_name || req.requester.username)
                              .substring(0, 2)
                              .toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-sm truncate">
                          {req.requester.full_name || req.requester.username}
                        </div>
                        <div className="text-[13px] text-on-surface-variant">
                          @{req.requester.username} wants to follow you · {timeAgo(req.created_at)}
                        </div>
                      </div>
                    </Link>

                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => handleAccept(req.id)}
                        disabled={processingId === req.id}
                        className="px-4 py-1.5 bg-primary text-on-primary text-sm font-bold rounded-lg hover:brightness-110 disabled:opacity-50 transition-colors"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => handleReject(req.id)}
                        disabled={processingId === req.id}
                        className="px-4 py-1.5 bg-surface-variant text-on-surface text-sm font-bold rounded-lg hover:bg-surface-container-high disabled:opacity-50 transition-colors"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </main>
      </div>
    </AppLayout>
  );
}