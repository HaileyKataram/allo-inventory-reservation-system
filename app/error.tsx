"use client";

import { RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-3xl items-center px-5 py-10">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Something went wrong</CardTitle>
          <CardDescription>
            The app could not load this view. Retry the request, and check the database connection if it persists.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md bg-zinc-50 p-3 font-mono text-xs text-zinc-600">
            {error.digest ?? error.message}
          </div>
          <Button onClick={reset}>
            <RefreshCcw className="h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
