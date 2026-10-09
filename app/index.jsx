import React from "react";
import { Redirect } from "expo-router";
import { useAuth } from "../src/providers/AuthProvider";
export default function Index() {
  const { session } = useAuth();
  return <Redirect href={session ? "/(tabs)" : "/auth/sign-in"} />;
}
