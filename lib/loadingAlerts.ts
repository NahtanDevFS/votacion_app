// utils/loadingAlerts.ts
import Swal, { SweetAlertResult } from "sweetalert2";

export const showLoadingAlert = (
  title: string = "Procesando..."
): {
  close: () => void;
  instance: Promise<SweetAlertResult<any>>;
} => {
  let swalInstance: any;

  const instance = Swal.fire({
    title: title,
    html: "Por favor espere...",
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    willOpen: () => {
      Swal.showLoading();
    },
    didOpen: () => {
      swalInstance = Swal.getPopup();
    },
  });

  return {
    close: () => swalInstance && Swal.close(),
    instance,
  };
};
