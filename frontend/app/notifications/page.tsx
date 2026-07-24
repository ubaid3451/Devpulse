"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  getFollowRequests,
  acceptFollowRequest,
  rejectFollowRequest,
  FollowRequestResponse,
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
  const [requests, setRequests] = useState<FollowRequestResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchRequests = () => {
    getFollowRequests()
      .then(setRequests)
      .catch((err) => console.error("Failed to load follow requests", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRequests();
  }, []);

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

  return (
    <AppLayout activeNav="notifications">
      <div className="bg-surface text-on-surface min-h-screen">
        <header className="flex items-center w-full px-md h-16 sticky top-0 z-50 bg-surface border-b border-outline-variant">
          <div className="font-headline-sm text-headline-sm font-bold text-on-surface">
            Notifications
          </div>
        </header>

        <main className="max-w-2xl mx-auto p-md lg:p-lg">
          <h2 className="text-title-lg font-bold text-on-surface mb-4">Follow Requests</h2>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <span className="material-symbols-outlined animate-spin-slow text-primary text-3xl">progress_activity</span>
            </div>
          ) : requests.length === 0 ? (
            <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-xl text-center">
              <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-2">how_to_reg</span>
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
                        <img src={req.requester.avatar_url} alt={req.requester.username} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-bold">
                          {(req.requester.full_name || req.requester.username).substring(0, 2).toUpperCase()}
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
          )}
        </main>
      </div>
    </AppLayout>
  );
}