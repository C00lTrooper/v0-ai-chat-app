"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/components/auth-provider";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address."),
  password: z.string().min(6, "Password must be at least 6 characters long."),
});

type LoginValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, login, signup } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState<"login" | "signup" | null>(
    null,
  );

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  useEffect(() => {
    if (isAuthenticated) {
      router.replace("/");
    }
  }, [isAuthenticated, router]);

  const onLogin = async (values: LoginValues) => {
    try {
      setIsSubmitting("login");
      await login(values.email, values.password);
      router.push("/");
    } catch (error) {
      const rawMessage =
        error instanceof Error ? error.message : "Failed to log in.";
      const message =
        rawMessage.includes("Invalid email or password") ||
        rawMessage.toLowerCase().includes("invalid email")
          ? "We couldn’t find an account with that email and password. Please check your details and try again."
          : "Something went wrong while logging you in. Please try again.";
      form.setError("root", { type: "server", message });
    } finally {
      setIsSubmitting(null);
    }
  };

  const onSignup = async (values: LoginValues) => {
    try {
      setIsSubmitting("signup");
      await signup(values.email, values.password);
      router.push("/");
    } catch (error) {
      const rawMessage =
        error instanceof Error ? error.message : "Failed to sign up.";
      const message = rawMessage.includes("already exists")
        ? "An account with this email already exists. Try logging in instead."
        : "Something went wrong while creating your account. Please try again.";
      form.setError("root", { type: "server", message });
    } finally {
      setIsSubmitting(null);
    }
  };

  return (
    <div className="min-h-dvh bg-gradient-to-b from-background via-background/95 to-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Card className="shadow-lg shadow-primary/5">
          <CardHeader>
            <CardTitle className="text-2xl">Welcome back</CardTitle>
            <CardDescription>
              Sign in to continue chatting with your AI assistant.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onLogin)}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          autoComplete="email"
                          placeholder="you@example.com"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          autoComplete="current-password"
                          placeholder="••••••••"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {form.formState.errors.root && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.root.message}
                  </p>
                )}

                <div className="space-y-2">
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isSubmitting !== null}
                  >
                    {isSubmitting === "login" ? "Logging in..." : "Log in"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={isSubmitting !== null}
                    onClick={form.handleSubmit(onSignup)}
                  >
                    {isSubmitting === "signup" ? "Signing up..." : "Sign up"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
