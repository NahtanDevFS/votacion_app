"use client";

import Image from "next/image";
import styles from "./page.module.css";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Verificar autenticación
    const user = localStorage.getItem("admin");
    if (!user) {
      router.push("/login");
      return;
    } else {
      router.push("/dashboard");
      return;
    }
  }, [router]);

  return <div className={styles.page}></div>;
}
