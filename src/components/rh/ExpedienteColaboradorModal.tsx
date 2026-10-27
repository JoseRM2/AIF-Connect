"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  crearColaboradorAction,
  type CrearColaboradorPayload,
} from "@/app/actions/colaboradores";
import { createClient } from "@/lib/supabase/client";
import {
  ACCEPT_EXPEDIENTES,
  TAMANO_MAXIMO_MB,
  subirDocumentosExpediente,
  validarArchivoExpediente,
} from "@/lib/storage/expedientes";
import type { Database } from "@/types/supabase";

type ColaboradorRow = Database["public"]["Tables"]["colaboradores"]["Row"];
type ColaboradorUpdate =
  Database["public"]["Tables"]["colaboradores"]["Update"];

export interface ExpedienteColaboradorModalProps {
  /** Si se pasa un colaborador, el formulario opera en modo edición. */
  colaboradorEditar?: ColaboradorRow | null;
  /** Lista de colaboradores actuales para selector de Jefe Directo y detección de columnas. */
  colaboradoresExistentes?: ColaboradorRow[];
  /** Se ejecuta tras insertar o actualizar exitosamente en Supabase. */
  onGuardadoExitoso: (
    colaborador: ColaboradorRow,
    esEdicion: boolean,
    mensajeExtra?: string
  ) => void;
  /** Cierra el modal / drawer. */
  onCerrar: () => void;
}

const EMPRESAS_CORPORATIVAS = ["AIF", "ROYAL"] as const;
const ESTATUS_OPCIONES = ["Activo", "Inactivo"] as const;
// Valores exactos del ENUM `rol_sistema` en Supabase
const ROLES_SISTEMA = ["Colaborador", "Jefatura", "Recursos Humanos"] as const;
const SEXOS = ["", "Masculino", "Femenino", "Otro"] as const;
const MESES = [
  "",
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

const SECTION_TITLE =
  "mb-3.5 border-l-2 border-brand-gold pl-2.5 text-[9px] font-bold uppercase tracking-widest text-gray-500";
const FIELD =
  "h-10 w-full rounded-sm border border-gray-200 bg-brand-surface px-3 text-xs text-gray-800 placeholder-gray-400 transition-colors focus:border-brand-dark focus:outline-none";
const MICRO_LABEL =
  "mb-1 block text-[8px] font-bold uppercase tracking-widest text-gray-400";

function textoONull(valor: string): string | null {
  const limpio = valor.trim();
  return limpio ? limpio : null;
}

function numeroONull(etiqueta: string, valor: string): number | null {
  const limpio = valor.replace(/[$,\s]/g, "");
  if (!limpio) return null;
  const n = Number(limpio);
  if (!Number.isFinite(n)) {
    throw new Error(`El campo "${etiqueta}" debe ser un número válido.`);
  }
  return n;
}

function enteroONull(etiqueta: string, valor: string): number | null {
  const n = numeroONull(etiqueta, valor);
  if (n === null) return null;
  if (!Number.isInteger(n)) {
    throw new Error(`El campo "${etiqueta}" debe ser un número entero.`);
  }
  return n;
}

function calcularAntiguedadTexto(fechaIngreso: string): string {
  if (!fechaIngreso) return "";
  const inicio = new Date(`${fechaIngreso}T00:00:00`);
  if (Number.isNaN(inicio.getTime())) return "";
  const hoy = new Date();
  let meses =
    (hoy.getFullYear() - inicio.getFullYear()) * 12 +
    (hoy.getMonth() - inicio.getMonth());
  if (meses < 0) meses = 0;
  const anios = Math.floor(meses / 12);
  const mesesRestantes = meses % 12;
  if (anios === 0) {
    return `${mesesRestantes} ${mesesRestantes === 1 ? "mes" : "meses"}`;
  }
  return `${anios} ${anios === 1 ? "año" : "años"}${
    mesesRestantes > 0 ? `, ${mesesRestantes} m` : ""
  }`;
}

interface CampoArchivoProps {
  id: string;
  label: string;
  archivo: File | null;
  error?: string;
  urlActual?: string | null;
  disabled: boolean;
  inputKey: number;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
}

function CampoArchivo({
  id,
  label,
  archivo,
  error,
  urlActual,
  disabled,
  inputKey,
  onChange,
}: CampoArchivoProps) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label htmlFor={id} className={`${MICRO_LABEL} mb-0`}>
          {label}
        </label>
        {urlActual && (
          <a
            href={urlActual}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[9px] font-bold uppercase tracking-widest text-brand-dark underline transition-opacity hover:opacity-70"
          >
            Ver documento actual
          </a>
        )}
      </div>
      <input
        key={inputKey}
        id={id}
        type="file"
        accept={ACCEPT_EXPEDIENTES}
        disabled={disabled}
        onChange={onChange}
        aria-invalid={Boolean(error)}
        className="flex h-10 w-full items-center rounded-sm border border-gray-200 bg-brand-surface px-3 py-1.5 text-xs text-gray-700 file:mr-3 file:rounded-sm file:border-0 file:bg-brand-beige/60 file:px-2.5 file:py-1 file:text-[10px] file:font-bold file:uppercase file:text-gray-800 hover:file:bg-brand-beige disabled:cursor-not-allowed disabled:opacity-60"
      />
      {archivo && !error && (
        <p className="mt-1 text-[10px] text-gray-500">
          Seleccionado: {archivo.name} ({(archivo.size / 1024 / 1024).toFixed(2)}{" "}
          MB)
          {urlActual ? " — reemplazará al documento actual." : ""}
        </p>
      )}
      {error && (
        <p
          role="alert"
          aria-live="polite"
          className="mt-1 text-[10px] font-semibold text-status-danger-dark"
        >
          {error}
        </p>
      )}
      {!archivo && !error && (
        <p className="mt-1 text-[10px] text-gray-400">
          PDF, JPG o PNG. Máx. {TAMANO_MAXIMO_MB} MB.
        </p>
      )}
    </div>
  );
}

export default function ExpedienteColaboradorModal({
  colaboradorEditar = null,
  onGuardadoExitoso,
  onCerrar,
}: ExpedienteColaboradorModalProps) {
  const uid = useId();
  const rawEditar = (colaboradorEditar ?? {}) as Record<string, unknown>;

  // 1. Identificación y Acceso
  const [noEmpleado, setNoEmpleado] = useState<string>(
    String(rawEditar.numero_empleado ?? rawEditar.no_empleado ?? "")
  );
  const [nombreCompleto, setNombreCompleto] = useState<string>(
    colaboradorEditar?.nombre_completo ?? colaboradorEditar?.nombre ?? ""
  );
  const [estatus, setEstatus] = useState<"Activo" | "Inactivo">(
    (colaboradorEditar?.estatus ?? "Activo")
      .toString()
      .toLowerCase()
      .includes("inactiv")
      ? "Inactivo"
      : "Activo"
  );
  const [correoCorporativo, setCorreoCorporativo] = useState<string>(
    colaboradorEditar?.correo_corporativo ?? colaboradorEditar?.correo ?? ""
  );
  const [anydesk, setAnydesk] = useState<string>(
    String(rawEditar.anydesk ?? "")
  );
  const [telOficina, setTelOficina] = useState<string>(
    String(rawEditar.telefono_oficina ?? "")
  );
  const [extOficina, setExtOficina] = useState<string>(
    String(rawEditar.extension ?? "")
  );

  // 2. Datos Corporativos (Catálogo estricto AIF y ROYAL)
  const [empresa, setEmpresa] = useState<"AIF" | "ROYAL">(
    (colaboradorEditar?.empresa ?? "AIF").toUpperCase() === "ROYAL"
      ? "ROYAL"
      : "AIF"
  );
  const [departamento, setDepartamento] = useState<string>(
    colaboradorEditar?.area ?? colaboradorEditar?.departamento ?? ""
  );
  const [puesto, setPuesto] = useState<string>(
    colaboradorEditar?.puesto ?? ""
  );
  const [rolSistema, setRolSistema] = useState<string>(
    colaboradorEditar?.rol_sistema === "RH"
      ? "Recursos Humanos"
      : colaboradorEditar?.rol_sistema === "Jefe"
        ? "Jefatura"
        : (colaboradorEditar?.rol_sistema ?? "Colaborador")
  );
  const [esJefatura, setEsJefatura] = useState<boolean>(
    Boolean(
      rawEditar.es_jefatura ??
        (colaboradorEditar?.rol_sistema === "Jefatura" ||
          colaboradorEditar?.rol_sistema === "Jefe")
    )
  );
  const [codigoPosicion, setCodigoPosicion] = useState<string>(
    String(rawEditar.codigo_posicion ?? "")
  );
  const [posicion, setPosicion] = useState<string>(
    String(rawEditar.posicion ?? "")
  );
  const [posicionAutorizador, setPosicionAutorizador] = useState<string>(
    String(rawEditar.posicion_autorizador ?? "")
  );
  const [jefeDirecto, setJefeDirecto] = useState<string>(() => {
    const candidato = String(
      rawEditar.jefe_directo_id ?? rawEditar.jefe_directo ?? ""
    ).trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      candidato
    )
      ? candidato
      : "";
  });
  const [listaJefaturas, setListaJefaturas] = useState<
    Array<{ id: string; nombre_completo: string }>
  >([]);
  const [cargandoJefaturas, setCargandoJefaturas] = useState<boolean>(false);
  const [oficina, setOficina] = useState<string>(
    String(rawEditar.oficina ?? "")
  );
  const [reclutador, setReclutador] = useState<string>(
    String(rawEditar.reclutador ?? "")
  );

  // 3. Fechas y Saldos
  const [fechaIngreso, setFechaIngreso] = useState<string>(
    String(
      rawEditar.fecha_ingreso ??
        (colaboradorEditar?.created_at
          ? colaboradorEditar.created_at.slice(0, 10)
          : new Date().toISOString().slice(0, 10))
    )
  );
  const [fechaBaja, setFechaBaja] = useState<string>(
    String(rawEditar.fecha_baja ?? "")
  );
  const [diaCumple, setDiaCumple] = useState<string>(
    String(rawEditar.dia_cumpleanos ?? "")
  );
  const [mesCumple, setMesCumple] = useState<string>(
    String(rawEditar.mes_cumpleanos ?? "")
  );
  const [saldoVacaciones, setSaldoVacaciones] = useState<string>(
    colaboradorEditar?.saldo_vacaciones !== undefined &&
      colaboradorEditar?.saldo_vacaciones !== null
      ? String(colaboradorEditar.saldo_vacaciones)
      : "12"
  );

  // 4. Datos Personales
  const [sexo, setSexo] = useState<string>(String(rawEditar.sexo ?? ""));
  const [rfc, setRfc] = useState<string>(String(rawEditar.rfc ?? ""));
  const [curp, setCurp] = useState<string>(String(rawEditar.curp ?? ""));
  const [nss, setNss] = useState<string>(String(rawEditar.nss ?? ""));
  const [id2, setId2] = useState<string>(String(rawEditar.id2 ?? ""));
  const [nivelEducativo, setNivelEducativo] = useState<string>(
    String(rawEditar.nivel_educativo ?? "")
  );
  const [telefonoPersonal, setTelefonoPersonal] = useState<string>(
    String(rawEditar.telefono_personal ?? "")
  );
  const [correoPersonal, setCorreoPersonal] = useState<string>(
    String(rawEditar.correo_personal ?? "")
  );
  const [domicilioCompleto, setDomicilioCompleto] = useState<string>(
    String(rawEditar.domicilio_completo ?? "")
  );

  // 5. Datos Financieros y Compensación
  const [sueldo, setSueldo] = useState<string>(String(rawEditar.sueldo ?? ""));
  const [bono, setBono] = useState<string>(String(rawEditar.bono ?? ""));
  const [totalCompensacion, setTotalCompensacion] = useState<string>(
    String(rawEditar.total_compensacion ?? "")
  );
  const [salarioDiario, setSalarioDiario] = useState<string>(
    String(rawEditar.salario_diario ?? "")
  );
  const [banco, setBanco] = useState<string>(String(rawEditar.banco ?? ""));
  const [clabe, setClabe] = useState<string>(String(rawEditar.clabe ?? ""));
  const [nomina, setNomina] = useState<string>(String(rawEditar.nomina ?? ""));
  const [diasAguinaldo, setDiasAguinaldo] = useState<string>(
    String(rawEditar.dias_aguinaldo ?? "15")
  );
  const [infonavit, setInfonavit] = useState<string>(
    String(rawEditar.infonavit ?? "")
  );
  const [aseguradora, setAseguradora] = useState<string>(
    String(rawEditar.aseguradora ?? "")
  );

  // 6. Contactos de Emergencia
  const [contactoEmergenciaNombre, setContactoEmergenciaNombre] =
    useState<string>(String(rawEditar.contacto_emergencia_nombre ?? ""));
  const [contactoEmergenciaNumero, setContactoEmergenciaNumero] =
    useState<string>(String(rawEditar.contacto_emergencia_numero ?? ""));
  const [beneficiario, setBeneficiario] = useState<string>(
    String(rawEditar.beneficiario ?? "")
  );
  const [parentesco, setParentesco] = useState<string>(
    String(rawEditar.parentesco ?? "")
  );

  // 7. Archivos (Nombres de referencia)
  const [fileComprobante, setFileComprobante] = useState<File | null>(null);
  const [fileCarta, setFileCarta] = useState<File | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<{
    comprobante?: string;
    carta?: string;
  }>({});
  const [inputKeys, setInputKeys] = useState({ comprobante: 0, carta: 0 });
  const [isUploading, setIsUploading] = useState<boolean>(false);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [credencial, setCredencial] = useState<{
    colaborador: ColaboradorRow;
    correo: string;
    contrasena: string;
    advertencia?: string;
  } | null>(null);
  const [copiado, setCopiado] = useState<"si" | "no" | "error">("no");

  const antiguedadCalculada = useMemo(
    () => calcularAntiguedadTexto(fechaIngreso),
    [fechaIngreso]
  );

  // Consultar colaboradores con bandera de supervisión (`es_jefatura = true`)
  useEffect(() => {
    let cancelado = false;

    async function cargarJefaturas() {
      setCargandoJefaturas(true);
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("colaboradores")
          .select("id, nombre_completo")
          .eq("es_jefatura", true)
          .order("nombre_completo", { ascending: true });

        if (cancelado || error) return;

        setListaJefaturas(
          (data ?? []).filter(
            (item): item is { id: string; nombre_completo: string } =>
              Boolean(item.id && item.nombre_completo)
          )
        );
      } finally {
        if (!cancelado) {
          setCargandoJefaturas(false);
        }
      }
    }

    cargarJefaturas();

    return () => {
      cancelado = true;
    };
  }, []);

  // Cerrar con tecla Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) {
        if (credencial) {
          onGuardadoExitoso(credencial.colaborador, false);
        } else {
          onCerrar();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isSubmitting, onCerrar, onGuardadoExitoso, credencial]);

  // Calcular compensación total automáticamente cuando cambian sueldo o bono
  useEffect(() => {
    const s = Number.parseFloat(sueldo);
    const b = Number.parseFloat(bono);
    if (!Number.isNaN(s) || !Number.isNaN(b)) {
      const suma = (Number.isNaN(s) ? 0 : s) + (Number.isNaN(b) ? 0 : b);
      if (suma > 0) {
        setTotalCompensacion(suma.toFixed(2));
      }
    }
  }, [sueldo, bono]);

  const handleSeleccionArchivo =
    (tipo: "comprobante" | "carta") => (e: ChangeEvent<HTMLInputElement>) => {
      const archivo = e.target.files?.[0] ?? null;
      const setFile = tipo === "comprobante" ? setFileComprobante : setFileCarta;

      if (!archivo) {
        setFile(null);
        setErrorArchivo((prev) => ({ ...prev, [tipo]: undefined }));
        return;
      }

      const error = validarArchivoExpediente(archivo);
      if (error) {
        setFile(null);
        setErrorArchivo((prev) => ({ ...prev, [tipo]: error }));
        // Remonta el input para limpiar la selección inválida
        setInputKeys((prev) => ({ ...prev, [tipo]: prev[tipo] + 1 }));
        return;
      }

      setFile(archivo);
      setErrorArchivo((prev) => ({ ...prev, [tipo]: undefined }));
    };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;

    const nombreLimpio = nombreCompleto.trim();
    const correoLimpio = correoCorporativo.trim();
    const puestoLimpio = puesto.trim();
    const deptoLimpio = departamento.trim() || "General";

    if (!nombreLimpio) {
      setErrorMsg("El nombre completo del colaborador es obligatorio.");
      return;
    }
    if (!correoLimpio) {
      setErrorMsg("El correo electrónico corporativo es obligatorio.");
      return;
    }
    if (!puestoLimpio) {
      setErrorMsg("El puesto o cargo del colaborador es obligatorio.");
      return;
    }

    if (errorArchivo.comprobante || errorArchivo.carta) {
      setErrorMsg("Corrige los archivos seleccionados antes de guardar.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const saldoNum = Number.parseInt(saldoVacaciones, 10);
    const saldoFinal =
      !Number.isNaN(saldoNum) && saldoNum >= 0 ? saldoNum : 12;

    try {
      const supabase = createClient();

      // Mapeo estricto: estado React (camelCase) -> columnas Supabase (snake_case).
      // Strings vacíos -> null; campos financieros/numéricos -> number.
      const payloadMapeado: ColaboradorUpdate = {
        // Núcleo de la tabla
        nombre_completo: nombreLimpio,
        correo_corporativo: correoLimpio,
        empresa, // "AIF" | "ROYAL"
        rol_sistema: rolSistema === "RH" ? "Recursos Humanos" : (rolSistema || "Colaborador"),
        es_jefatura: esJefatura,
        saldo_vacaciones: saldoFinal,

        // Identificación
        no_empleado: textoONull(noEmpleado),
        estatus,
        anydesk: textoONull(anydesk),
        tel_oficina: textoONull(telOficina),
        ext_oficina: textoONull(extOficina),

        // Corporativo
        departamento: deptoLimpio,
        puesto: puestoLimpio,
        codigo_posicion: textoONull(codigoPosicion),
        posicion: textoONull(posicion),
        posicion_autorizador: textoONull(posicionAutorizador),
        jefe_directo_id: textoONull(jefeDirecto),
        jefe_directo:
          listaJefaturas.find((j) => j.id === jefeDirecto)?.nombre_completo ??
          null,
        oficina: textoONull(oficina),
        reclutador: textoONull(reclutador),

        // Fechas
        fecha_ingreso: textoONull(fechaIngreso),
        fecha_baja: textoONull(fechaBaja),
        dia_cumpleanos: enteroONull("Día de cumpleaños", diaCumple),
        mes_cumpleanos: textoONull(mesCumple),

        // Personal
        sexo: textoONull(sexo),
        rfc: textoONull(rfc)?.toUpperCase() ?? null,
        curp: textoONull(curp)?.toUpperCase() ?? null,
        nss: textoONull(nss),
        id2: textoONull(id2),
        nivel_educativo: textoONull(nivelEducativo),
        telefono_personal: textoONull(telefonoPersonal),
        correo_personal: textoONull(correoPersonal),
        domicilio_completo: textoONull(domicilioCompleto),

        // Financiero (numéricos como number; CLABE/NSS como texto para conservar ceros)
        sueldo: numeroONull("Sueldo", sueldo),
        bono: numeroONull("Bono", bono),
        total_compensacion: numeroONull("Total Compensación", totalCompensacion),
        salario_diario: numeroONull("SD (Salario Diario)", salarioDiario),
        banco: textoONull(banco),
        clabe: textoONull(clabe),
        nomina: textoONull(nomina),
        dias_pago: textoONull(diasAguinaldo), // columna TEXT
        infonavit: textoONull(infonavit),
        aseguradora: textoONull(aseguradora),

        // Emergencia
        contacto_emergencia_nombre: textoONull(contactoEmergenciaNombre),
        contacto_emergencia_numero: textoONull(contactoEmergenciaNumero),
        beneficiario: textoONull(beneficiario),
        parentesco_beneficiario: textoONull(parentesco),
      };

      if (colaboradorEditar?.id) {
        // Modo Edición: primero se suben los documentos nuevos (si hay) y luego un único UPDATE.
        // Sin archivos nuevos, las URLs actuales no se tocan.
        let urlsArchivos: ColaboradorUpdate = {};
        if (fileComprobante || fileCarta) {
          setIsUploading(true);
          const subida = await subirDocumentosExpediente(
            supabase,
            colaboradorEditar.id,
            {
              comprobante_estudios: fileComprobante,
              carta_recomendacion: fileCarta,
            }
          );
          if (subida.errores.length > 0) {
            throw new Error(
              `No se pudieron subir los documentos (${subida.errores.join(
                "; "
              )}). No se guardaron cambios.`
            );
          }
          urlsArchivos = subida.urls;
        }

        const { data, error } = await supabase
          .from("colaboradores")
          .update({ ...payloadMapeado, ...urlsArchivos })
          .eq("id", colaboradorEditar.id)
          .select("*")
          .maybeSingle();

        if (error) {
          throw new Error(error.message);
        }

        const actualizado: ColaboradorRow = (data as ColaboradorRow | null) ?? {
          ...colaboradorEditar,
          ...(payloadMapeado as Partial<ColaboradorRow>),
          ...(urlsArchivos as Partial<ColaboradorRow>),
        };
        onGuardadoExitoso(actualizado, true);
      } else {
        // Modo Nuevo Ingreso: cuenta de Auth + expediente vía Server Action (service role)
        const payloadInsert: CrearColaboradorPayload = {
          ...(payloadMapeado as CrearColaboradorPayload),
          nombre_completo: nombreLimpio,
          // Las URLs se guardan tras la subida, cuando ya existe el id del colaborador
          comprobante_estudios_url: null,
          carta_recomendacion_url: null,
        };

        const resultado = await crearColaboradorAction(payloadInsert);

        if (!resultado.ok) {
          throw new Error(resultado.error);
        }

        // Subida de documentos con el id recién creado. Un fallo aquí NO revierte el alta:
        // la cuenta ya existe y la contraseña debe mostrarse igualmente.
        let colaboradorFinal: ColaboradorRow = resultado.colaborador;
        let advertencia: string | undefined;

        if (fileComprobante || fileCarta) {
          setIsUploading(true);
          const subida = await subirDocumentosExpediente(
            supabase,
            resultado.colaborador.id,
            {
              comprobante_estudios: fileComprobante,
              carta_recomendacion: fileCarta,
            }
          );

          const hayUrls = Object.keys(subida.urls).length > 0;
          const fallos = [...subida.errores];

          if (hayUrls) {
            const { data: actualizadoConUrls, error: errorUrls } = await supabase
              .from("colaboradores")
              .update(subida.urls)
              .eq("id", resultado.colaborador.id)
              .select("*")
              .maybeSingle();

            if (errorUrls) {
              fallos.push(
                `No se pudieron registrar las URLs en el expediente: ${errorUrls.message}`
              );
            } else {
              colaboradorFinal =
                (actualizadoConUrls as ColaboradorRow | null) ?? {
                  ...colaboradorFinal,
                  ...(subida.urls as Partial<ColaboradorRow>),
                };
            }
          }

          if (fallos.length > 0) {
            advertencia = `El colaborador se creó, pero hubo problemas con los documentos (${fallos.join(
              "; "
            )}). Edita el expediente para volver a subirlos.`;
          }
        }

        // La alta se confirma en la lista al cerrar el panel de credenciales,
        // para que RH alcance a copiar la contraseña antes de cerrar el modal.
        setCopiado("no");
        setCredencial({
          colaborador: colaboradorFinal,
          correo: colaboradorFinal.correo_corporativo || correoLimpio,
          contrasena: resultado.contrasenaGenerada,
          advertencia,
        });
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? `No se pudo guardar el expediente: ${err.message}`
          : "Ocurrió un error al guardar el expediente en Supabase."
      );
    } finally {
      setIsUploading(false);
      setIsSubmitting(false);
    }
  };

  const handleCopiarContrasena = async () => {
    if (!credencial) return;
    try {
      await navigator.clipboard.writeText(credencial.contrasena);
      setCopiado("si");
    } catch {
      setCopiado("error");
    }
  };

  if (credencial) {
    const nombreAlta =
      credencial.colaborador.nombre_completo ||
      credencial.colaborador.nombre ||
      "Colaborador";

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`titulo-credencial-${uid}`}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      >
        <div className="w-full max-w-lg overflow-hidden rounded-sm bg-brand-surface shadow-2xl">
          <header className="border-b border-gray-100 px-8 py-6">
            <p className="text-[9px] font-bold uppercase tracking-widest text-status-success-dark">
              ALTA REGISTRADA CON ÉXITO
            </p>
            <h2
              id={`titulo-credencial-${uid}`}
              className="mt-1 text-base font-bold text-gray-900"
            >
              {nombreAlta}
            </h2>
            <p className="mt-0.5 text-[10px] uppercase tracking-widest text-gray-400">
              {credencial.correo}
            </p>
          </header>

          <div className="flex flex-col gap-4 px-8 py-6">
            <div className="rounded-sm border border-status-success/30 bg-status-success/10 px-4 py-3 text-xs font-semibold text-status-success-dark">
              Copia esta contraseña definitiva para el administrador de
              credenciales.
            </div>

            <div>
              <label
                htmlFor={`contrasena-${uid}`}
                className={MICRO_LABEL}
              >
                CONTRASEÑA GENERADA
              </label>
              <div className="flex items-stretch gap-2">
                <input
                  id={`contrasena-${uid}`}
                  type="text"
                  readOnly
                  value={credencial.contrasena}
                  onFocus={(e) => e.currentTarget.select()}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="h-10 w-full rounded-sm border border-gray-200 bg-brand-beige/25 px-3 font-mono text-sm font-bold tracking-wider text-gray-900 focus:border-brand-dark focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopiarContrasena}
                  className="h-10 shrink-0 rounded-sm bg-brand-beige px-4 text-[9px] font-bold uppercase tracking-widest text-brand-dark transition-colors hover:bg-brand-beige/70"
                >
                  {copiado === "si" ? "¡COPIADO!" : "COPIAR"}
                </button>
              </div>
              <p
                role="status"
                aria-live="polite"
                className="mt-1.5 min-h-[14px] text-[10px] text-gray-500"
              >
                {copiado === "si" && "Contraseña copiada al portapapeles."}
                {copiado === "error" &&
                  "No se pudo copiar automáticamente: selecciona el texto y cópialo manualmente."}
              </p>
            </div>

            {credencial.advertencia && (
              <div
                role="alert"
                className="rounded-sm border border-brand-gold/40 bg-brand-beige/40 px-4 py-3 text-xs font-semibold text-brand-dark"
              >
                {credencial.advertencia}
              </div>
            )}

            <p className="text-[10px] leading-relaxed text-gray-500">
              Esta contraseña no se volverá a mostrar. Guárdala ahora en el
              administrador de credenciales corporativo.
            </p>
          </div>

          <footer className="flex justify-end border-t border-gray-100 px-8 py-5">
            <button
              type="button"
              onClick={() => onGuardadoExitoso(credencial.colaborador, false)}
              className="h-10 rounded-sm bg-brand-dark px-6 text-[9px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-brand-dark/90"
            >
              YA LA COPIÉ, CERRAR
            </button>
          </footer>
        </div>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`titulo-expediente-${uid}`}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/55 p-4 backdrop-blur-sm sm:p-6 md:p-10"
    >
      <div className="w-full max-w-6xl overflow-hidden rounded-sm bg-brand-surface shadow-2xl">
        {/* Encabezado idéntico a la captura de referencia */}
        <header className="flex items-center justify-between border-b border-gray-100 px-8 py-6">
          <h2
            id={`titulo-expediente-${uid}`}
            className="text-base font-bold text-gray-900"
          >
            Expediente de Colaborador
          </h2>
          <button
            type="button"
            onClick={onCerrar}
            disabled={isSubmitting}
            className="text-[10px] font-bold uppercase tracking-widest text-gray-400 transition-colors hover:text-gray-800 disabled:opacity-50"
          >
            CANCELAR
          </button>
        </header>

        <form onSubmit={handleSubmit} className="flex flex-col gap-7 px-8 py-7">
          {errorMsg && (
            <div
              role="alert"
              aria-live="polite"
              className="rounded-sm border border-status-danger/30 bg-status-danger/10 px-4 py-3 text-xs font-semibold text-status-danger-dark"
            >
              {errorMsg}
            </div>
          )}

          {/* 1. IDENTIFICACIÓN Y ACCESO */}
          <section>
            <h3 className={SECTION_TITLE}>IDENTIFICACIÓN Y ACCESO</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label htmlFor={`no-emp-${uid}`} className="sr-only">
                  No. Empleado
                </label>
                <input
                  id={`no-emp-${uid}`}
                  type="text"
                  value={noEmpleado}
                  onChange={(e) => setNoEmpleado(e.target.value)}
                  placeholder="No. Empleado"
                  autoCorrect="off"
                  spellCheck={false}
                  className={FIELD}
                />
              </div>

              <div>
                <label htmlFor={`nombre-${uid}`} className="sr-only">
                  Nombre Personal (Obligatorio)
                </label>
                <input
                  id={`nombre-${uid}`}
                  type="text"
                  value={nombreCompleto}
                  onChange={(e) => setNombreCompleto(e.target.value)}
                  placeholder="Nombre Personal *"
                  required
                  className={FIELD}
                />
              </div>

              <div>
                <label htmlFor={`estatus-${uid}`} className="sr-only">
                  Estatus
                </label>
                <select
                  id={`estatus-${uid}`}
                  value={estatus}
                  onChange={(e) =>
                    setEstatus(e.target.value as "Activo" | "Inactivo")
                  }
                  className={FIELD}
                >
                  {ESTATUS_OPCIONES.map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor={`correo-corp-${uid}`} className="sr-only">
                  Correo Corporativo (Obligatorio)
                </label>
                <input
                  id={`correo-corp-${uid}`}
                  type="email"
                  value={correoCorporativo}
                  onChange={(e) => setCorreoCorporativo(e.target.value)}
                  placeholder="Correo Corporativo *"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  required
                  className={FIELD}
                />
              </div>

              <div>
                <label htmlFor={`anydesk-${uid}`} className="sr-only">
                  AnyDesk
                </label>
                <input
                  id={`anydesk-${uid}`}
                  type="text"
                  value={anydesk}
                  onChange={(e) => setAnydesk(e.target.value)}
                  placeholder="AnyDesk"
                  autoCorrect="off"
                  spellCheck={false}
                  className={FIELD}
                />
              </div>

              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-9">
                  <label htmlFor={`tel-oficina-${uid}`} className="sr-only">
                    Tel Oficina
                  </label>
                  <input
                    id={`tel-oficina-${uid}`}
                    type="tel"
                    value={telOficina}
                    onChange={(e) => setTelOficina(e.target.value)}
                    placeholder="Tel Oficina"
                    className={FIELD}
                  />
                </div>
                <div className="col-span-3">
                  <label htmlFor={`ext-oficina-${uid}`} className="sr-only">
                    Ext
                  </label>
                  <input
                    id={`ext-oficina-${uid}`}
                    type="text"
                    value={extOficina}
                    onChange={(e) => setExtOficina(e.target.value)}
                    placeholder="Ext"
                    className={FIELD}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* 2. DATOS CORPORATIVOS */}
          <section>
            <h3 className={SECTION_TITLE}>DATOS CORPORATIVOS</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label htmlFor={`empresa-${uid}`} className="sr-only">
                  Empresa Corporativa
                </label>
                <select
                  id={`empresa-${uid}`}
                  value={empresa}
                  onChange={(e) =>
                    setEmpresa(e.target.value as "AIF" | "ROYAL")
                  }
                  className={FIELD}
                >
                  {EMPRESAS_CORPORATIVAS.map((emp) => (
                    <option key={emp} value={emp}>
                      {emp}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor={`depto-${uid}`} className="sr-only">
                  Departamento
                </label>
                <input
                  id={`depto-${uid}`}
                  type="text"
                  value={departamento}
                  onChange={(e) => setDepartamento(e.target.value)}
                  placeholder="Departamento *"
                  required
                  className={FIELD}
                />
              </div>

              <div>
                <label htmlFor={`puesto-${uid}`} className="sr-only">
                  Puesto
                </label>
                <input
                  id={`puesto-${uid}`}
                  type="text"
                  value={puesto}
                  onChange={(e) => setPuesto(e.target.value)}
                  placeholder="Puesto *"
                  required
                  className={FIELD}
                />
              </div>

              <div>
                <label htmlFor={`cod-pos-${uid}`} className="sr-only">
                  Código Posición
                </label>
                <input
                  id={`cod-pos-${uid}`}
                  type="text"
                  value={codigoPosicion}
                  onChange={(e) => setCodigoPosicion(e.target.value)}
                  placeholder="Código Posición"
                  autoCorrect="off"
                  spellCheck={false}
                  className={FIELD}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor={`posicion-${uid}`} className="sr-only">
                    Posición
                  </label>
                  <input
                    id={`posicion-${uid}`}
                    type="text"
                    value={posicion}
                    onChange={(e) => setPosicion(e.target.value)}
                    placeholder="Posición"
                    className={FIELD}
                  />
                </div>
                <div>
                  <label htmlFor={`rol-sis-${uid}`} className="sr-only">
                    Rol en Sistema
                  </label>
                  <select
                    id={`rol-sis-${uid}`}
                    value={rolSistema}
                    onChange={(e) => {
                      const nuevoRol = e.target.value;
                      setRolSistema(nuevoRol);
                      if (nuevoRol === "Jefatura") {
                        setEsJefatura(true);
                      }
                    }}
                    className={FIELD}
                  >
                    {ROLES_SISTEMA.map((rol) => (
                      <option key={rol} value={rol}>
                        Rol: {rol}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor={`pos-aut-${uid}`} className="sr-only">
                  Posición Autorizador
                </label>
                <input
                  id={`pos-aut-${uid}`}
                  type="text"
                  value={posicionAutorizador}
                  onChange={(e) => setPosicionAutorizador(e.target.value)}
                  placeholder="Posición Autorizador"
                  className={FIELD}
                />
              </div>

              <div className="md:col-span-3">
                <label
                  htmlFor={`es-jefatura-${uid}`}
                  className="flex cursor-pointer select-none items-center justify-between gap-3 rounded-sm border border-gray-200 bg-brand-beige/25 px-4 py-2.5 transition-colors hover:border-brand-dark/40"
                >
                  <div className="flex items-center gap-3">
                    <input
                      id={`es-jefatura-${uid}`}
                      type="checkbox"
                      checked={esJefatura}
                      onChange={(e) => setEsJefatura(e.target.checked)}
                      className="h-4 w-4 cursor-pointer rounded-sm border-gray-300 accent-brand-dark focus:ring-brand-dark"
                    />
                    <span className="text-xs font-semibold text-gray-800">
                      Este perfil tiene personal a su cargo (Jefatura)
                    </span>
                  </div>
                  <span
                    className={`rounded-sm border px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest ${
                      esJefatura
                        ? "border-brand-gold/50 bg-brand-dark text-brand-gold"
                        : "border-gray-200 bg-white text-gray-400"
                    }`}
                  >
                    {esJefatura ? "JEFATURA ACTIVA" : "SIN EQUIPO A CARGO"}
                  </span>
                </label>
              </div>

              <div>
                <label htmlFor={`jefe-${uid}`} className="sr-only">
                  Jefe Directo
                </label>
                <select
                  id={`jefe-${uid}`}
                  value={jefeDirecto}
                  onChange={(e) => setJefeDirecto(e.target.value)}
                  className={FIELD}
                >
                  <option value="">
                    {cargandoJefaturas
                      ? "Cargando jefaturas..."
                      : "Jefe Directo (Sin asignar)"}
                  </option>
                  {jefeDirecto &&
                    !listaJefaturas.some((j) => j.id === jefeDirecto) && (
                      <option value={jefeDirecto}>{jefeDirecto}</option>
                    )}
                  {listaJefaturas
                    .filter((jefe) => jefe.id !== colaboradorEditar?.id)
                    .map((jefe) => (
                      <option key={jefe.id} value={jefe.id}>
                        {jefe.nombre_completo}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label htmlFor={`oficina-${uid}`} className="sr-only">
                  Oficina
                </label>
                <input
                  id={`oficina-${uid}`}
                  type="text"
                  value={oficina}
                  onChange={(e) => setOficina(e.target.value)}
                  placeholder="Oficina"
                  className={FIELD}
                />
              </div>

              <div>
                <label htmlFor={`reclutador-${uid}`} className="sr-only">
                  Reclutador
                </label>
                <input
                  id={`reclutador-${uid}`}
                  type="text"
                  value={reclutador}
                  onChange={(e) => setReclutador(e.target.value)}
                  placeholder="Reclutador"
                  className={FIELD}
                />
              </div>
            </div>
          </section>

          {/* 3. FECHAS Y SALDOS */}
          <section>
            <h3 className={SECTION_TITLE}>FECHAS Y SALDOS</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label htmlFor={`fecha-ingreso-${uid}`} className={MICRO_LABEL}>
                  FECHA DE INGRESO
                </label>
                <input
                  id={`fecha-ingreso-${uid}`}
                  type="date"
                  value={fechaIngreso}
                  onChange={(e) => setFechaIngreso(e.target.value)}
                  className={FIELD}
                />
              </div>

              <div>
                <label htmlFor={`fecha-baja-${uid}`} className={MICRO_LABEL}>
                  FECHA DE BAJA
                </label>
                <input
                  id={`fecha-baja-${uid}`}
                  type="date"
                  value={fechaBaja}
                  onChange={(e) => setFechaBaja(e.target.value)}
                  className={FIELD}
                />
              </div>

              <div>
                <span className={MICRO_LABEL}>DÍA Y MES CUMPLEAÑOS</span>
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-3">
                    <label htmlFor={`dia-cumple-${uid}`} className="sr-only">
                      Día de cumpleaños
                    </label>
                    <input
                      id={`dia-cumple-${uid}`}
                      type="number"
                      min={1}
                      max={31}
                      value={diaCumple}
                      onChange={(e) => setDiaCumple(e.target.value)}
                      placeholder="Día"
                      className={FIELD}
                    />
                  </div>
                  <div className="col-span-9">
                    <label htmlFor={`mes-cumple-${uid}`} className="sr-only">
                      Mes de cumpleaños
                    </label>
                    <select
                      id={`mes-cumple-${uid}`}
                      value={mesCumple}
                      onChange={(e) => setMesCumple(e.target.value)}
                      className={FIELD}
                    >
                      {MESES.map((m) => (
                        <option key={m || "vacio"} value={m}>
                          {m || "Mes"}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor={`antiguedad-${uid}`} className="sr-only">
                  Antigüedad
                </label>
                <input
                  id={`antiguedad-${uid}`}
                  type="text"
                  value={antiguedadCalculada}
                  readOnly
                  placeholder="Antigüedad"
                  className={`${FIELD} bg-brand-beige/30 text-gray-600`}
                />
              </div>

              <div>
                <label htmlFor={`saldo-vac-${uid}`} className="sr-only">
                  Saldo Inicial de Vacaciones
                </label>
                <input
                  id={`saldo-vac-${uid}`}
                  type="number"
                  min={0}
                  max={60}
                  value={saldoVacaciones}
                  onChange={(e) => setSaldoVacaciones(e.target.value)}
                  placeholder="Saldo Inicial de Vacaciones"
                  className={FIELD}
                />
              </div>
            </div>
          </section>

          {/* 4. DATOS PERSONALES */}
          <section>
            <h3 className={SECTION_TITLE}>DATOS PERSONALES</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label htmlFor={`sexo-${uid}`} className="sr-only">
                  Sexo
                </label>
                <select
                  id={`sexo-${uid}`}
                  value={sexo}
                  onChange={(e) => setSexo(e.target.value)}
                  className={FIELD}
                >
                  {SEXOS.map((s) => (
                    <option key={s || "default"} value={s}>
                      {s || "Sexo"}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor={`rfc-${uid}`} className="sr-only">
                  RFC
                </label>
                <input
                  id={`rfc-${uid}`}
                  type="text"
                  value={rfc}
                  onChange={(e) => setRfc(e.target.value.toUpperCase())}
                  placeholder="RFC"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  className={FIELD}
                />
              </div>

              <div>
                <label htmlFor={`curp-${uid}`} className="sr-only">
                  CURP
                </label>
                <input
                  id={`curp-${uid}`}
                  type="text"
                  value={curp}
                  onChange={(e) => setCurp(e.target.value.toUpperCase())}
                  placeholder="CURP"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  className={FIELD}
                />
              </div>

              <div>
                <label htmlFor={`nss-${uid}`} className="sr-only">
                  NSS
                </label>
                <input
                  id={`nss-${uid}`}
                  type="text"
                  value={nss}
                  onChange={(e) => setNss(e.target.value)}
                  placeholder="NSS"
                  autoCorrect="off"
                  spellCheck={false}
                  className={FIELD}
                />
              </div>

              <div>
                <label htmlFor={`id2-${uid}`} className="sr-only">
                  ID2
                </label>
                <input
                  id={`id2-${uid}`}
                  type="text"
                  value={id2}
                  onChange={(e) => setId2(e.target.value)}
                  placeholder="ID2"
                  autoCorrect="off"
                  spellCheck={false}
                  className={FIELD}
                />
              </div>

              <div>
                <label htmlFor={`nivel-edu-${uid}`} className="sr-only">
                  Nivel Educativo
                </label>
                <input
                  id={`nivel-edu-${uid}`}
                  type="text"
                  value={nivelEducativo}
                  onChange={(e) => setNivelEducativo(e.target.value)}
                  placeholder="Nivel Educativo"
                  className={FIELD}
                />
              </div>

              <div>
                <label htmlFor={`tel-pers-${uid}`} className="sr-only">
                  Teléfono Personal
                </label>
                <input
                  id={`tel-pers-${uid}`}
                  type="tel"
                  value={telefonoPersonal}
                  onChange={(e) => setTelefonoPersonal(e.target.value)}
                  placeholder="Teléfono Personal"
                  className={FIELD}
                />
              </div>

              <div>
                <label htmlFor={`correo-pers-${uid}`} className="sr-only">
                  Correo Personal
                </label>
                <input
                  id={`correo-pers-${uid}`}
                  type="email"
                  value={correoPersonal}
                  onChange={(e) => setCorreoPersonal(e.target.value)}
                  placeholder="Correo Personal"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className={FIELD}
                />
              </div>

              <div className="md:col-span-3">
                <label htmlFor={`domicilio-${uid}`} className="sr-only">
                  Domicilio Completo
                </label>
                <input
                  id={`domicilio-${uid}`}
                  type="text"
                  value={domicilioCompleto}
                  onChange={(e) => setDomicilioCompleto(e.target.value)}
                  placeholder="Domicilio Completo"
                  className={FIELD}
                />
              </div>
            </div>
          </section>

          {/* 5. DATOS FINANCIEROS Y COMPENSACIÓN */}
          <section>
            <h3 className={SECTION_TITLE}>DATOS FINANCIEROS Y COMPENSACIÓN</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label htmlFor={`sueldo-${uid}`} className="sr-only">
                  Sueldo
                </label>
                <input
                  id={`sueldo-${uid}`}
                  type="text"
                  inputMode="decimal"
                  value={sueldo}
                  onChange={(e) => setSueldo(e.target.value)}
                  placeholder="Sueldo"
                  className={FIELD}
                />
              </div>

              <div>
                <label htmlFor={`bono-${uid}`} className="sr-only">
                  Bono
                </label>
                <input
                  id={`bono-${uid}`}
                  type="text"
                  inputMode="decimal"
                  value={bono}
                  onChange={(e) => setBono(e.target.value)}
                  placeholder="Bono"
                  className={FIELD}
                />
              </div>

              <div>
                <label htmlFor={`total-comp-${uid}`} className="sr-only">
                  Total Compensación
                </label>
                <input
                  id={`total-comp-${uid}`}
                  type="text"
                  value={totalCompensacion}
                  onChange={(e) => setTotalCompensacion(e.target.value)}
                  placeholder="Total Compensación"
                  className={`${FIELD} bg-brand-beige/25`}
                />
              </div>

              <div>
                <label htmlFor={`sd-${uid}`} className="sr-only">
                  SD (Salario Diario)
                </label>
                <input
                  id={`sd-${uid}`}
                  type="text"
                  inputMode="decimal"
                  value={salarioDiario}
                  onChange={(e) => setSalarioDiario(e.target.value)}
                  placeholder="SD (Salario Diario)"
                  className={FIELD}
                />
              </div>

              <div>
                <label htmlFor={`banco-${uid}`} className="sr-only">
                  Banco
                </label>
                <input
                  id={`banco-${uid}`}
                  type="text"
                  value={banco}
                  onChange={(e) => setBanco(e.target.value)}
                  placeholder="Banco"
                  className={FIELD}
                />
              </div>

              <div>
                <label htmlFor={`clabe-${uid}`} className="sr-only">
                  CLABE
                </label>
                <input
                  id={`clabe-${uid}`}
                  type="text"
                  inputMode="numeric"
                  value={clabe}
                  onChange={(e) => setClabe(e.target.value)}
                  placeholder="CLABE"
                  autoCorrect="off"
                  spellCheck={false}
                  className={FIELD}
                />
              </div>

              <div>
                <label htmlFor={`nomina-${uid}`} className="sr-only">
                  Nómina
                </label>
                <input
                  id={`nomina-${uid}`}
                  type="text"
                  value={nomina}
                  onChange={(e) => setNomina(e.target.value)}
                  placeholder="Nómina"
                  className={FIELD}
                />
              </div>

              <div>
                <label htmlFor={`aguinaldo-${uid}`} className="sr-only">
                  Días de Aguinaldo
                </label>
                <input
                  id={`aguinaldo-${uid}`}
                  type="number"
                  value={diasAguinaldo}
                  onChange={(e) => setDiasAguinaldo(e.target.value)}
                  placeholder="Días de Aguinaldo"
                  className={FIELD}
                />
              </div>

              <div>
                <label htmlFor={`infonavit-${uid}`} className="sr-only">
                  INFONAVIT
                </label>
                <input
                  id={`infonavit-${uid}`}
                  type="text"
                  value={infonavit}
                  onChange={(e) => setInfonavit(e.target.value)}
                  placeholder="INFONAVIT"
                  className={FIELD}
                />
              </div>

              <div>
                <label htmlFor={`aseguradora-${uid}`} className="sr-only">
                  Aseguradora
                </label>
                <input
                  id={`aseguradora-${uid}`}
                  type="text"
                  value={aseguradora}
                  onChange={(e) => setAseguradora(e.target.value)}
                  placeholder="Aseguradora"
                  className={FIELD}
                />
              </div>
            </div>
          </section>

          {/* 6. CONTACTOS DE EMERGENCIA */}
          <section>
            <h3 className={SECTION_TITLE}>CONTACTOS DE EMERGENCIA</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label htmlFor={`em-nombre-${uid}`} className="sr-only">
                  Nombre de Contacto de Emergencia
                </label>
                <input
                  id={`em-nombre-${uid}`}
                  type="text"
                  value={contactoEmergenciaNombre}
                  onChange={(e) => setContactoEmergenciaNombre(e.target.value)}
                  placeholder="Nombre de Contacto de Emergencia"
                  className={FIELD}
                />
              </div>

              <div>
                <label htmlFor={`em-num-${uid}`} className="sr-only">
                  Número de Emergencia
                </label>
                <input
                  id={`em-num-${uid}`}
                  type="tel"
                  value={contactoEmergenciaNumero}
                  onChange={(e) => setContactoEmergenciaNumero(e.target.value)}
                  placeholder="Número de Emergencia"
                  className={FIELD}
                />
              </div>

              <div>
                <label htmlFor={`beneficiario-${uid}`} className="sr-only">
                  Beneficiario
                </label>
                <input
                  id={`beneficiario-${uid}`}
                  type="text"
                  value={beneficiario}
                  onChange={(e) => setBeneficiario(e.target.value)}
                  placeholder="Beneficiario"
                  className={FIELD}
                />
              </div>

              <div>
                <label htmlFor={`parentesco-${uid}`} className="sr-only">
                  Parentesco
                </label>
                <input
                  id={`parentesco-${uid}`}
                  type="text"
                  value={parentesco}
                  onChange={(e) => setParentesco(e.target.value)}
                  placeholder="Parentesco"
                  className={FIELD}
                />
              </div>
            </div>
          </section>

          {/* 7. ARCHIVOS */}
          <section>
            <h3 className={SECTION_TITLE}>ARCHIVOS</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <CampoArchivo
                id={`file-estudios-${uid}`}
                label="COMPROBANTE DE ESTUDIOS"
                archivo={fileComprobante}
                error={errorArchivo.comprobante}
                urlActual={colaboradorEditar?.comprobante_estudios_url}
                disabled={isSubmitting}
                inputKey={inputKeys.comprobante}
                onChange={handleSeleccionArchivo("comprobante")}
              />
              <CampoArchivo
                id={`file-carta-${uid}`}
                label="CARTA DE RECOMENDACIÓN"
                archivo={fileCarta}
                error={errorArchivo.carta}
                urlActual={colaboradorEditar?.carta_recomendacion_url}
                disabled={isSubmitting}
                inputKey={inputKeys.carta}
                onChange={handleSeleccionArchivo("carta")}
              />
            </div>
          </section>

          {/* Footer de Guardado */}
          <footer className="flex items-center justify-end gap-3 border-t border-gray-100 pt-6">
            <button
              type="button"
              onClick={onCerrar}
              disabled={isSubmitting}
              className="rounded-sm border border-gray-300 bg-brand-surface px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              CANCELAR
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-sm bg-brand-dark px-7 py-3 text-[10px] font-bold uppercase tracking-widest text-brand-gold shadow-sm transition-colors hover:bg-brand-dark/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isUploading
                ? "GUARDANDO DOCUMENTOS..."
                : isSubmitting
                  ? "GUARDANDO EXPEDIENTE..."
                  : "GUARDAR EXPEDIENTE"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
