// hooks/useVotacionTimer.ts
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase"; // 1. Importar Supabase

interface UseVotacionTimerProps {
  fechaActivacion: string | null;
  duracionSegundos: number;
  estado: "inactiva" | "activa" | "finalizada";
  onExpire?: () => void;
}

/**
 * Hook personalizado para manejar el temporizador de votaciones
 * Garantiza sincronización precisa entre todos los dispositivos
 */
export function useVotacionTimer({
  fechaActivacion,
  duracionSegundos,
  estado,
  onExpire,
}: UseVotacionTimerProps) {
  const [tiempoRestante, setTiempoRestante] = useState<number | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasExpiredRef = useRef(false);

  // Ref para almacenar el desfase del reloj (client vs server)
  const clockOffsetRef = useRef<number | null>(null);
  const [isSyncing, setIsSyncing] = useState(true);

  // 1. Sincronizar reloj con el servidor UNA VEZ al montar el hook
  useEffect(() => {
    const syncClock = async () => {
      try {
        // Llamamos a la RPC que creamos en el Paso 1
        const { data, error } = await supabase.rpc("get_server_timestamp");
        if (error) throw error;

        const serverTimeMs = new Date(data).getTime();
        const localTimeMs = Date.now();

        // Calculamos el desfase (offset)
        const offset = serverTimeMs - localTimeMs;

        clockOffsetRef.current = offset;
        console.log(`Clock sync complete. Offset: ${offset}ms`);
      } catch (err) {
        console.error("Fallo al sincronizar reloj con el servidor:", err);
        // Si falla, usamos el reloj local (offset de 0) como fallback
        clockOffsetRef.current = 0;
      } finally {
        setIsSyncing(false);
      }
    };

    syncClock();
  }, []); // Se ejecuta solo una vez

  // 2. Lógica del temporizador principal
  useEffect(() => {
    // No hacer nada si el reloj aún no está sincronizado
    if (isSyncing) {
      return;
    }

    hasExpiredRef.current = false;

    if (estado !== "activa" || !fechaActivacion) {
      setTiempoRestante(null);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    // Calcular tiempo de finalización en milisegundos
    const fechaActivacionMs = new Date(fechaActivacion).getTime();
    const fechaFinMs = fechaActivacionMs + duracionSegundos * 1000;

    const updateTimer = () => {
      // 3. Usar el reloj local + el desfase calculado
      const ahoraMs = Date.now() + (clockOffsetRef.current ?? 0);

      const restanteMs = fechaFinMs - ahoraMs;

      if (restanteMs <= 0) {
        // Tiempo expirado
        setTiempoRestante(0);

        if (!hasExpiredRef.current && onExpire) {
          hasExpiredRef.current = true;
          onExpire();
        }
        return;
      }

      // Calcular segundos restantes
      const segundosRestantes = Math.floor((restanteMs + 999) / 1000);
      setTiempoRestante(segundosRestantes);

      // Calcular cuándo debe ocurrir la próxima actualización
      const msHastaProximoCambio = restanteMs % 1000 || 1000;

      // Agregar un pequeño buffer
      const delay = msHastaProximoCambio + 10;

      timeoutRef.current = setTimeout(updateTimer, delay);
    };

    // Primera actualización inmediata
    updateTimer();

    // Cleanup
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [fechaActivacion, duracionSegundos, estado, onExpire, isSyncing]); // 4. Añadir isSyncing como dependencia

  // Devolver null (o un string "Sincronizando...") mientras se calibra el reloj
  return isSyncing ? null : tiempoRestante;
}

/**
 * Formatea el tiempo restante en formato MM:SS
 */
export function formatTiempoRestante(segundos: number | null): string {
  if (segundos === null) return "Sinc..."; // Mostrar esto mientras se sincroniza

  const minutos = Math.floor(segundos / 60);
  const segs = segundos % 60;

  return `${String(minutos).padStart(2, "0")}:${String(segs).padStart(2, "0")}`;
}

/**
 * Determina el estado visual del timer basado en el tiempo restante
 */
export function getTimerState(
  segundos: number | null
): "normal" | "alert" | "caution" | "warning" | "critical" {
  if (segundos === null) return "normal";
  if (segundos < 15) return "critical";
  if (segundos < 25) return "warning";
  if (segundos < 40) return "caution";
  if (segundos < 50) return "alert";
  return "normal";
}
