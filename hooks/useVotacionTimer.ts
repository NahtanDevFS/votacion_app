// hooks/useVotacionTimer.ts
import { useState, useEffect, useRef } from 'react';

interface UseVotacionTimerProps {
  fechaActivacion: string | null;
  duracionSegundos: number;
  estado: 'inactiva' | 'activa' | 'finalizada';
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
  onExpire
}: UseVotacionTimerProps) {
  const [tiempoRestante, setTiempoRestante] = useState<number | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasExpiredRef = useRef(false);

  useEffect(() => {
    // Reset cuando cambia el estado
    hasExpiredRef.current = false;

    if (estado !== 'activa' || !fechaActivacion) {
      setTiempoRestante(null);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    // Calcular tiempo de finalización en milisegundos
    const fechaActivacionMs = new Date(fechaActivacion).getTime();
    const fechaFinMs = fechaActivacionMs + (duracionSegundos * 1000);

    const updateTimer = () => {
      const ahoraMs = Date.now();
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
      // IMPORTANTE: Sumamos 999ms antes de dividir para redondear hacia arriba
      // Esto asegura que mostremos el segundo completo hasta que realmente expire
      const segundosRestantes = Math.floor((restanteMs + 999) / 1000);
      setTiempoRestante(segundosRestantes);

      // Calcular cuándo debe ocurrir la próxima actualización
      // Queremos actualizar justo cuando cambie el segundo
      const msHastaProximoCambio = restanteMs % 1000 || 1000;
      
      // Agregar un pequeño buffer para evitar actualizaciones anticipadas
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
  }, [fechaActivacion, duracionSegundos, estado, onExpire]);

  return tiempoRestante;
}

/**
 * Formatea el tiempo restante en formato MM:SS
 */
export function formatTiempoRestante(segundos: number | null): string {
  if (segundos === null) return '--:--';
  
  const minutos = Math.floor(segundos / 60);
  const segs = segundos % 60;
  
  return `${String(minutos).padStart(2, '0')}:${String(segs).padStart(2, '0')}`;
}

/**
 * Determina el estado visual del timer basado en el tiempo restante
 */
export function getTimerState(segundos: number | null): 
  'normal' | 'alert' | 'caution' | 'warning' | 'critical' {
  if (segundos === null) return 'normal';
  if (segundos < 15) return 'critical';
  if (segundos < 25) return 'warning';
  if (segundos < 40) return 'caution';
  if (segundos < 50) return 'alert';
  return 'normal';
}