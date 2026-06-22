// Configuración global de la API del backend
// Por defecto apunta a localhost:8000 que es la dirección estándar para uvicorn
const API_BASE_URL = "https://backend-agendas.onrender.com";

// Variables de estado de la aplicación
let gradosDisponibles = [];
let todasLasCitas = [];
let correoConsultado = null;

// ==========================================================================
// INICIALIZACIÓN DE LA APLICACIÓN
// La función cerrarModal() se define en el script inline del HTML (en el <head>)
// para garantizar disponibilidad inmediata antes de la carga de este archivo.
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
    cargarGrados();
    verificarEstadoSesion();

    // Asignar eventos de validación al terminar de escribir (evento blur)
    const inputCorreo = document.getElementById("input-correo");
    const inputConfirmarCorreo = document.getElementById("input-confirmar-correo");

    if (inputCorreo) {
        inputCorreo.addEventListener("blur", validarCampoCorreo);
        inputCorreo.addEventListener("input", () => clearError("correo"));
    }

    if (inputConfirmarCorreo) {
        inputConfirmarCorreo.addEventListener("blur", validarCampoConfirmarCorreo);
        inputConfirmarCorreo.addEventListener("input", () => clearError("confirmar-correo"));
    }
});

// ==========================================================================
// NAVEGACIÓN Y TABS
// ==========================================================================
function switchTab(tabName) {
    const tabs = {
        agendar: { section: "section-agendar", button: "tab-agendar-btn" },
        citas: { section: "section-citas", button: "tab-citas-btn" },
        calendario: { section: "section-calendario", button: "tab-calendario-btn" },
        login: { section: "section-login", button: "tab-login-btn" }
    };

    // Desactivar todas las pestañas
    Object.keys(tabs).forEach(key => {
        const sec = document.getElementById(tabs[key].section);
        const btn = document.getElementById(tabs[key].button);
        if (sec) sec.classList.remove("active");
        if (btn) btn.classList.remove("active");
    });

    // Activar pestaña solicitada
    const activeTab = tabs[tabName];
    if (activeTab) {
        const sec = document.getElementById(activeTab.section);
        const btn = document.getElementById(activeTab.button);
        if (sec) sec.classList.add("active");
        if (btn) btn.classList.add("active");
    }

    // Acciones especiales al cambiar de pestaña
    if (tabName === "agendar") {
        const selectGrado = document.getElementById("select-grado");
        if (selectGrado && selectGrado.value) {
            handleGradoChange();
        }
    } else if (tabName === "citas") {
        const isLoggedIn = sessionStorage.getItem("adminLoggedIn") === "true";
        if (isLoggedIn) {
            const consultaCont = document.getElementById("citas-consulta-container");
            const resultadosCont = document.getElementById("citas-resultados-container");
            const btnCambiar = document.getElementById("btn-cambiar-consulta-correo");
            const subtitle = document.getElementById("citas-resultados-subtitle");

            if (consultaCont) consultaCont.classList.add("hidden");
            if (resultadosCont) resultadosCont.classList.remove("hidden");
            if (btnCambiar) btnCambiar.style.display = "none";
            if (subtitle) subtitle.textContent = "Historial completo de citas de matrícula académica registradas.";
            cargarCitas();
        } else {
            if (correoConsultado) {
                const consultaCont = document.getElementById("citas-consulta-container");
                const resultadosCont = document.getElementById("citas-resultados-container");
                const btnCambiar = document.getElementById("btn-cambiar-consulta-correo");
                const subtitle = document.getElementById("citas-resultados-subtitle");

                if (consultaCont) consultaCont.classList.add("hidden");
                if (resultadosCont) resultadosCont.classList.remove("hidden");
                if (btnCambiar) btnCambiar.style.display = "inline-block";
                if (subtitle) subtitle.textContent = `Mostrando citas asociadas al correo: ${correoConsultado}`;
                cargarCitas(correoConsultado);
            } else {
                const consultaCont = document.getElementById("citas-consulta-container");
                const resultadosCont = document.getElementById("citas-resultados-container");

                if (consultaCont) consultaCont.classList.remove("hidden");
                if (resultadosCont) resultadosCont.classList.add("hidden");
            }
        }
    } else if (tabName === "calendario") {
        renderCalendar();
        // Seleccionar por defecto el día 8 de Julio de 2026
        const initialAppointments = todasLasCitas.filter(cita => {
            const parsed = parseHorarioDate(cita.horario);
            return parsed && parsed.day === 8 && parsed.month === 6 && parsed.year === 2026;
        });
        showDayAppointments(2026, 6, 8, initialAppointments);
    }
}

// ==========================================================================
// CONSUMO DE ENDPOINTS DE LA API (FETCH)
// ==========================================================================

// Carga la lista de grados y docentes desde el backend
async function cargarGrados() {
    const selectGrado = document.getElementById("select-grado");

    try {
        const response = await fetch(`${API_BASE_URL}/api/grados`);
        if (!response.ok) {
            throw new Error("No se pudo obtener la lista de grados.");
        }

        gradosDisponibles = await response.json();

        // Limpiar el selector excepto la opción por defecto
        selectGrado.innerHTML = '<option value="" disabled selected>Selecciona un grado escolar...</option>';

        // Poblar el selector
        gradosDisponibles.forEach(g => {
            const option = document.createElement("option");
            option.value = g.grado;
            option.textContent = `${g.area} - ${g.docente}`;
            selectGrado.appendChild(option);
        });

    } catch (error) {
        console.error("Error al cargar grados:", error);
        showToast("Error de conexión", "No se pudo conectar con el servidor para obtener los grados.", "error");
    }
}

// Maneja el cambio de grado para consultar al docente y horarios correspondientes
async function handleGradoChange() {
    const selectGrado = document.getElementById("select-grado");
    const gradoId = selectGrado.value;

    const docenteInfoBox = document.getElementById("docente-info-box");
    const docenteNombre = document.getElementById("docente-nombre");
    const diasGrid = document.getElementById("dias-grid");
    const horasContainer = document.getElementById("horas-container");
    const horariosGrid = document.getElementById("horarios-grid");

    if (!gradoId) {
        docenteInfoBox.classList.add("hidden");
        return;
    }

    // Limpiar errores del campo grado
    clearError("grado");

    // Mostrar estado de carga en el panel de horarios
    diasGrid.innerHTML = `
        <div class="no-grado-selected">
            <i class="fa-solid fa-circle-notch fa-spin"></i>
            <span>Cargando días disponibles...</span>
        </div>
    `;
    horasContainer.classList.add("hidden");
    horariosGrid.innerHTML = "";

    try {
        const response = await fetch(`${API_BASE_URL}/api/horarios/${gradoId}`);
        if (!response.ok) {
            if (response.status === 404) {
                throw new Error("El grado seleccionado no es válido.");
            }
            throw new Error("Error al obtener los horarios.");
        }

        const data = await response.json();

        // Actualizar información del docente
        docenteNombre.textContent = data.docente;
        docenteInfoBox.classList.remove("hidden");

        // Limpiar contenedores
        diasGrid.innerHTML = "";
        horasContainer.classList.add("hidden");
        horariosGrid.innerHTML = "";

        if (!data.horarios || data.horarios.length === 0) {
            diasGrid.innerHTML = `
                <div class="no-grado-selected">
                    <i class="fa-regular fa-calendar-times"></i>
                    <span>No hay horarios disponibles para este docente.</span>
                </div>
            `;
            return;
        }

        // Agrupar horarios por día
        const horariosPorDia = {};
        data.horarios.forEach(horario => {
            const partes = horario.split(" ");
            const dia = partes[0] + " " + partes[1]; // e.g. "Mié 8/Jul"
            const hora = partes[2]; // e.g. "07:00"
            if (!horariosPorDia[dia]) {
                horariosPorDia[dia] = [];
            }
            horariosPorDia[dia].push({ horario_completo: horario, hora: hora });
        });

        // Renderizar botones de días
        Object.keys(horariosPorDia).forEach(dia => {
            const dayBtn = document.createElement("button");
            dayBtn.type = "button";
            dayBtn.className = "btn-dia";
            dayBtn.innerHTML = `<i class="fa-regular fa-calendar-check"></i> ${formatearDiaCompleto(dia)}`;

            dayBtn.addEventListener("click", (e) => {
                // Quitar clase activa de otros botones
                document.querySelectorAll(".btn-dia").forEach(btn => btn.classList.remove("active"));
                e.currentTarget.classList.add("active");

                // Mostrar grid de horas
                horasContainer.classList.remove("hidden");
                horariosGrid.innerHTML = "";

                // Renderizar las horas del día seleccionado
                horariosPorDia[dia].forEach((item, index) => {
                    const optionContainer = document.createElement("label");
                    optionContainer.className = "horario-option";

                    const radioInput = document.createElement("input");
                    radioInput.type = "radio";
                    radioInput.name = "horario-seleccionado";
                    radioInput.value = item.horario_completo;
                    radioInput.id = `horario-${index}`;
                    radioInput.addEventListener("change", () => clearError("horario"));

                    const chipDiv = document.createElement("div");
                    chipDiv.className = "horario-chip";

                    const timeSpan = document.createElement("span");
                    timeSpan.className = "horario-time";
                    timeSpan.textContent = item.hora;

                    chipDiv.appendChild(timeSpan);
                    optionContainer.appendChild(radioInput);
                    optionContainer.appendChild(chipDiv);

                    horariosGrid.appendChild(optionContainer);
                });
            });

            diasGrid.appendChild(dayBtn);
        });

    } catch (error) {
        console.error("Error al cargar horarios:", error);
        docenteInfoBox.classList.add("hidden");
        horariosGrid.innerHTML = `
            <div class="no-grado-selected">
                <i class="fa-solid fa-circle-exclamation" style="color: var(--color-danger)"></i>
                <span>Error al cargar horarios disponibles.</span>
            </div>
        `;
        showToast("Error de consulta", error.message, "error");
    }
}

// Carga todas las citas registradas en el servidor
async function cargarCitas(correo = null) {
    try {
        let url = `${API_BASE_URL}/api/citas`;
        if (correo) {
            url += `?correo=${encodeURIComponent(correo)}`;
        }
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error("No se pudo obtener la lista de citas.");
        }

        todasLasCitas = await response.json();

        // Actualizar el número de la pestaña de citas
        document.getElementById("citas-badge").textContent = todasLasCitas.length;

        // Renderizar en el listado
        renderizarCitas(todasLasCitas);

        // Refrescar el calendario si está visible
        const tabCalendario = document.getElementById("section-calendario");
        if (tabCalendario && tabCalendario.classList.contains("active")) {
            renderCalendar();
            const selectedDayEl = document.querySelector(".calendar-day.selected-day");
            if (selectedDayEl) {
                const day = parseInt(selectedDayEl.textContent, 10);
                const year = currentCalendarDate.getFullYear();
                const month = currentCalendarDate.getMonth();
                const dayAppointments = todasLasCitas.filter(cita => {
                    const parsed = parseHorarioDate(cita.horario);
                    return parsed && parsed.day === day && parsed.month === month && parsed.year === year;
                });
                showDayAppointments(year, month, day, dayAppointments);
            }
        }

    } catch (error) {
        console.error("Error al cargar citas:", error);
        showToast("Error de sincronización", "No se pudo actualizar el listado de citas.", "error");
    }
}

// ==========================================================================
// VALIDACIÓN Y ENVÍO DEL FORMULARIO
// ==========================================================================
async function handleFormSubmit(event) {
    event.preventDefault();

    // Elementos de los campos
    const inputAcudiente = document.getElementById("input-acudiente");
    const inputTelefono = document.getElementById("input-telefono");
    const inputCorreo = document.getElementById("input-correo");
    const inputConfirmarCorreo = document.getElementById("input-confirmar-correo");
    const inputEstudiante = document.getElementById("input-estudiante");
    const selectGrado = document.getElementById("select-grado");

    // Obtener horario seleccionado
    const selectedHorarioRadio = document.querySelector('input[name="horario-seleccionado"]:checked');

    let isFormValid = true;

    // 1. Validar Acudiente
    if (inputAcudiente.value.trim().length < 2) {
        showFieldError("acudiente", "Ingresa el nombre completo del acudiente (mínimo 2 caracteres).");
        isFormValid = false;
    } else {
        clearError("acudiente");
    }

    // 2. Validar Teléfono
    if (inputTelefono.value.trim().length < 7) {
        showFieldError("telefono", "Ingresa un número telefónico de contacto válido.");
        isFormValid = false;
    } else {
        clearError("telefono");
    }

    // 3. Validar Correo
    if (!validarCampoCorreo()) {
        isFormValid = false;
    }

    // 3b. Validar Confirmación de Correo
    if (!validarCampoConfirmarCorreo()) {
        isFormValid = false;
    }

    // 4. Validar Estudiante
    if (inputEstudiante.value.trim().length < 2) {
        showFieldError("estudiante", "Ingresa el nombre completo del estudiante (mínimo 2 caracteres).");
        isFormValid = false;
    } else {
        clearError("estudiante");
    }

    // 5. Validar Grado
    if (!selectGrado.value) {
        showFieldError("grado", "Selecciona un grado escolar.");
        isFormValid = false;
    } else {
        clearError("grado");
    }

    // 6. Validar Horario
    if (!selectedHorarioRadio) {
        showFieldError("horario", "Debes seleccionar un horario disponible de la lista.");
        isFormValid = false;
    } else {
        clearError("horario");
    }

    // Si el formulario no es válido, detener el flujo
    if (!isFormValid) {
        showToast("Campos incompletos", "Por favor corrige los errores resaltados en el formulario antes de continuar.", "error");
        return;
    }

    // Bloquear botón de envío para evitar peticiones múltiples
    const btnSubmit = document.getElementById("btn-submit");
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Registrando agendamiento...';

    // Preparar objeto de envío
    const payload = {
        acudiente: inputAcudiente.value.trim(),
        telefono: inputTelefono.value.trim(),
        correo: inputCorreo.value.trim(),
        estudiante: inputEstudiante.value.trim(),
        grado: selectGrado.value,
        horario: selectedHorarioRadio.value
    };

    try {
        const response = await fetch(`${API_BASE_URL}/api/citas`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok) {
            // Éxito al registrar
            showToast("Agendamiento Confirmado", data.message || "Su cita de matrícula fue agendada exitosamente. Revise su correo para la confirmación.", "success");

            // Restablecer formulario
            document.getElementById("form-agendamiento").reset();
            document.getElementById("docente-info-box").classList.add("hidden");

            // Limpiar los chips de horario
            document.getElementById("horarios-grid").innerHTML = `
                <div class="no-grado-selected">
                    <i class="fa-solid fa-calendar-day"></i>
                    <span>Selecciona el grado para ver los horarios disponibles</span>
                </div>
            `;

            // Actualizar datos
            await cargarCitas();

            // Redirigir suavemente a la pestaña de citas
            setTimeout(() => {
                switchTab("citas");
            }, 800);

        } else {
            // Manejo de errores controlados por la API
            showToast("No se pudo registrar", data.detail || "Error al registrar el agendamiento. Intente nuevamente.", "error");
        }

    } catch (error) {
        console.error("Error al enviar cita:", error);
        showToast("Error de conexión", "No se pudo establecer comunicación con el servidor.", "error");
    } finally {
        // Desbloquear botón
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<i class="fa-solid fa-circle-check"></i> Confirmar Agendamiento de Matrícula';
    }
}

// Muestra los mensajes de error en el formulario
function showFieldError(field, msg) {
    const errorSpan = document.getElementById(`error-${field}`);
    const inputElement = document.getElementById(`input-${field}`) || document.getElementById(`select-${field}`) || document.getElementById(`horarios-grid`);

    if (errorSpan) {
        errorSpan.textContent = msg;
    }

    if (inputElement && field !== "horario") {
        inputElement.closest(".form-group").classList.add("invalid");
    }
}

// Limpia los mensajes de error del formulario
function clearError(field) {
    const errorSpan = document.getElementById(`error-${field}`);
    const inputElement = document.getElementById(`input-${field}`) || document.getElementById(`select-${field}`) || document.getElementById(`horarios-grid`);

    if (errorSpan) {
        errorSpan.textContent = "";
    }

    if (inputElement && field !== "horario") {
        inputElement.closest(".form-group").classList.remove("invalid");
    }
}

// ==========================================================================
// RENDERIZADO Y BÚSQUEDA EN EL DASHBOARD
// ==========================================================================

// Renders del listado de citas en el dashboard
function renderizarCitas(citas) {
    const listGrid = document.getElementById("citas-lista-grid");
    const emptyState = document.getElementById("citas-empty-state");

    listGrid.innerHTML = "";

    if (!citas || citas.length === 0) {
        listGrid.classList.add("hidden");
        emptyState.classList.remove("hidden");
        return;
    }

    listGrid.classList.remove("hidden");
    emptyState.classList.add("hidden");

    citas.forEach(cita => {
        // Obtener el docente para este grado
        const gradoDetalle = gradosDisponibles.find(g => g.grado === cita.grado);
        const docenteNombre = gradoDetalle ? gradoDetalle.docente : "No asignado";
        const areaNombre = gradoDetalle ? gradoDetalle.area : "Área no asignada";

        let horarioFormateado = cita.horario;
        const partesHorario = cita.horario.split(" ");
        if (partesHorario.length >= 3) {
            const diaFormateado = formatearDiaCompleto(partesHorario[0] + " " + partesHorario[1]);
            horarioFormateado = `${diaFormateado} a las ${partesHorario[2]}`;
        }

        const card = document.createElement("div");
        card.className = "cita-card";

        card.innerHTML = `
            <div class="cita-card-header">
                <div class="student-info">
                    <span class="student-name">${escapeHTML(cita.estudiante)}</span>
                    <span class="student-grade">${escapeHTML(areaNombre)}</span>
                </div>
                <div class="header-actions">
                    <select class="cita-card-actions" onchange="handleCardAction(this, '${cita.grado}', '${escapeHTML(cita.horario)}')">
                        <option value="" disabled selected>Acciones</option>
                        <option value="reprogramar">Reprogramar cita</option>
                        <option value="cancelar">Cancelar cita</option>
                    </select>
                </div>
            </div>
            
            <div class="cita-card-body">
                <div class="info-row">
                    <i class="fa-regular fa-user"></i>
                    <span class="label">Acudiente:</span>
                    <span class="value">${escapeHTML(cita.acudiente)}</span>
                </div>
                <div class="info-row">
                    <i class="fa-regular fa-user"></i>
                    <span class="label">Estudiante:</span>
                    <span class="value">${escapeHTML(cita.estudiante)}</span>
                </div>
                <div class="info-row">
                    <i class="fa-solid fa-phone"></i>
                    <span class="label">Teléfono:</span>
                    <span class="value">${escapeHTML(cita.telefono)}</span>
                </div>
                <div class="info-row">
                    <i class="fa-regular fa-envelope"></i>
                    <span class="label">Correo:</span>
                    <span class="value">${escapeHTML(cita.correo)}</span>
                </div>
                <div class="info-row">
                    <i class="fa-solid fa-chalkboard-user"></i>
                    <span class="label">Docente:</span>
                    <span class="value">${escapeHTML(docenteNombre)}</span>
                </div>
            </div>
            
            <div class="cita-card-footer">
                <i class="fa-regular fa-calendar"></i>
                <span>${escapeHTML(horarioFormateado)}</span>
            </div>
        `;

        listGrid.appendChild(card);
    });
}

// Filtra las citas en pantalla según el texto ingresado en el buscador
function filtrarCitas() {
    const query = document.getElementById("input-buscar").value.toLowerCase().trim();

    if (!query) {
        renderizarCitas(todasLasCitas);
        return;
    }

    const citasFiltradas = todasLasCitas.filter(cita => {
        // Encontrar docente correspondiente para buscar por docente
        const gradoDetalle = gradosDisponibles.find(g => g.grado === cita.grado);
        const docenteNombre = gradoDetalle ? gradoDetalle.docente.toLowerCase() : "";
        const areaNombre = gradoDetalle ? gradoDetalle.area.toLowerCase() : "";

        return (
            cita.estudiante.toLowerCase().includes(query) ||
            cita.acudiente.toLowerCase().includes(query) ||
            areaNombre.includes(query) ||
            docenteNombre.includes(query) ||
            cita.horario.toLowerCase().includes(query)
        );
    });

    renderizarCitas(citasFiltradas);
}

// ==========================================================================
// UTILIDADES
// ==========================================================================

// Previene inyecciones de código HTML en el DOM al renderizar variables de texto
function escapeHTML(str) {
    if (!str) return "";
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Convierte una fecha abreviada como "Mié 8/Jul" a formato completo "8 de Julio de 2026"
function formatearDiaCompleto(diaAbreviado) {
    const partes = diaAbreviado.split(" ");
    if (partes.length < 2) return diaAbreviado;
    const fechaParts = partes[1].split("/");
    if (fechaParts.length < 2) return diaAbreviado;
    const numeroDia = fechaParts[0];
    const mesAbrev = fechaParts[1];

    const meses = {
        "Ene": "Enero", "Feb": "Febrero", "Mar": "Marzo",
        "Abr": "Abril", "May": "Mayo", "Jun": "Junio",
        "Jul": "Julio", "Ago": "Agosto", "Sep": "Septiembre",
        "Oct": "Octubre", "Nov": "Noviembre", "Dic": "Diciembre"
    };

    const mesCompleto = meses[mesAbrev] || mesAbrev;
    return `${numeroDia} de ${mesCompleto} de 2026`;
}

// Sistema dinámico de alertas (Toasts)
function showToast(title, message, type = "success") {
    const container = document.getElementById("toast-container");

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;

    const iconClass = type === "success"
        ? "fa-solid fa-circle-check"
        : "fa-solid fa-circle-exclamation";

    toast.innerHTML = `
        <i class="${iconClass} toast-icon"></i>
        <div class="toast-content">
            <span class="toast-title">${title}</span>
            <span class="toast-desc">${message}</span>
        </div>
    `;

    // Evento para cerrar haciendo click
    toast.addEventListener("click", () => {
        toast.classList.add("fade-out");
        setTimeout(() => toast.remove(), 300);
    });

    container.appendChild(toast);

    // Auto-cierre del toast a los 4 segundos
    setTimeout(() => {
        if (toast.parentNode) {
            toast.classList.add("fade-out");
            setTimeout(() => toast.remove(), 300);
        }
    }, 4000);
}

// Manejador de las acciones de cada tarjeta de cita (ej. Cancelación)
async function handleCardAction(selectElement, grado, horario) {
    const action = selectElement.value;
    if (action === "cancelar") {
        const confirmar = confirm("¿Está seguro de que desea cancelar este agendamiento? El horario asignado se liberará.");
        if (confirmar) {
            try {
                const response = await fetch(`${API_BASE_URL}/api/citas?grado=${encodeURIComponent(grado)}&horario=${encodeURIComponent(horario)}`, {
                    method: "DELETE"
                });
                const data = await response.json();
                if (response.ok) {
                    showToast("Cita Cancelada", "El agendamiento se ha cancelado con éxito y el horario se ha liberado.", "success");
                    await refrescarCitas(); // Recargar datos
                } else {
                    showToast("Error", data.detail || "No se pudo cancelar el agendamiento.", "error");
                }
            } catch (error) {
                console.error("Error al cancelar la cita:", error);
                showToast("Error de conexión", "No se pudo comunicar con el servidor.", "error");
            }
        }
    } else if (action === "reprogramar") {
        cargarHorariosReprogramar(grado, horario);
    }
    // Reiniciar el select
    selectElement.value = "";
}

// Variables globales para la gestión del Calendario
let currentCalendarDate = new Date(2026, 6, 1); // Julio de 2026 por defecto

// Renderiza los días y citas en el grid del calendario
function renderCalendar() {
    const monthYearTitle = document.getElementById("calendar-month-year");
    const daysGrid = document.getElementById("calendar-days-grid");

    if (!monthYearTitle || !daysGrid) return;

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();

    const monthNames = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];

    monthYearTitle.textContent = `${monthNames[month]} ${year}`;
    daysGrid.innerHTML = "";

    // Obtener primer día de la semana del mes y total de días
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    // Obtener días totales del mes anterior para relleno
    const prevTotalDays = new Date(year, month, 0).getDate();

    // Rellenar días del mes anterior
    for (let i = firstDayIndex - 1; i >= 0; i--) {
        const dayDiv = document.createElement("div");
        dayDiv.className = "calendar-day padding-day";
        dayDiv.textContent = prevTotalDays - i;
        daysGrid.appendChild(dayDiv);
    }

    // Rellenar días del mes actual
    for (let day = 1; day <= totalDays; day++) {
        const dayDiv = document.createElement("div");
        dayDiv.className = "calendar-day current-month-day";
        dayDiv.textContent = day;

        // Buscar agendamientos en este día específico
        const dayAppointments = todasLasCitas.filter(cita => {
            const parsed = parseHorarioDate(cita.horario);
            return parsed && parsed.day === day && parsed.month === month && parsed.year === year;
        });

        if (dayAppointments.length > 0) {
            dayDiv.classList.add("has-events");

            const badge = document.createElement("span");
            badge.className = "calendar-event-badge";
            badge.textContent = dayAppointments.length;
            dayDiv.appendChild(badge);
        }

        // Marcar día de hoy
        const today = new Date();
        if (today.getDate() === day && today.getMonth() === month && today.getFullYear() === year) {
            dayDiv.classList.add("today");
        }

        // Evento de clic en un día
        dayDiv.addEventListener("click", () => {
            document.querySelectorAll(".calendar-day").forEach(d => d.classList.remove("selected-day"));
            dayDiv.classList.add("selected-day");
            showDayAppointments(year, month, day, dayAppointments);
        });

        // Autoseleccionar el día por defecto si ya estaba seleccionado
        const selectedDayEl = document.querySelector(".calendar-day.selected-day");
        if (selectedDayEl && parseInt(selectedDayEl.textContent, 10) === day) {
            dayDiv.classList.add("selected-day");
        }

        daysGrid.appendChild(dayDiv);
    }
}

// Avanzar/Retroceder meses
function prevMonth() {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
    renderCalendar();
}

function nextMonth() {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
    renderCalendar();
}

// Parsea fechas del formato "Mié 8/Jul 07:00"
function parseHorarioDate(horarioStr) {
    if (!horarioStr) return null;
    const parts = horarioStr.split(" ");
    if (parts.length < 2) return null;
    const dateParts = parts[1].split("/");
    if (dateParts.length < 2) return null;

    const day = parseInt(dateParts[0], 10);
    const monthAbrev = dateParts[1].toLowerCase();

    const monthsMap = {
        'ene': 0, 'feb': 1, 'mar': 2, 'abr': 3, 'may': 4, 'jun': 5,
        'jul': 6, 'ago': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dic': 11
    };

    const month = monthsMap[monthAbrev] !== undefined ? monthsMap[monthAbrev] : 6; // Julio por defecto

    return {
        day: day,
        month: month,
        year: 2026 // Año base
    };
}

// Muestra las citas en el listado lateral
function showDayAppointments(year, month, day, appointments) {
    const monthNames = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];

    const title = document.getElementById("selected-date-title");
    const container = document.getElementById("day-appointments-list");

    if (!title || !container) return;

    title.textContent = `${day} de ${monthNames[month]} de ${year}`;
    container.innerHTML = "";

    if (appointments.length === 0) {
        container.innerHTML = `
            <div class="no-appointments-container">
                <i class="fa-regular fa-calendar-check"></i>
                <p>No hay agendamientos registrados para este día.</p>
            </div>
        `;
        return;
    }

    appointments.forEach(cita => {
        const item = document.createElement("div");
        item.className = "calendar-app-item";

        const gradoDetalle = gradosDisponibles.find(g => g.grado === cita.grado);
        const docenteNombre = gradoDetalle ? gradoDetalle.docente : "No asignado";
        const areaNombre = gradoDetalle ? gradoDetalle.area : "Área no asignada";

        const parts = cita.horario.split(" ");
        const hora = parts.length > 2 ? parts[2] : cita.horario;

        item.innerHTML = `
            <div class="app-item-header">
                <span class="app-item-time"><i class="fa-regular fa-clock"></i> ${hora}</span>
                <span class="app-item-grade">${escapeHTML(areaNombre)}</span>
            </div>
            <div class="app-item-body">
                <p><strong>Estudiante:</strong> ${escapeHTML(cita.estudiante)}</p>
                <p><strong>Acudiente:</strong> ${escapeHTML(cita.acudiente)}</p>
                <p><strong>Teléfono:</strong> ${escapeHTML(cita.telefono)}</p>
                <p><strong>Docente:</strong> ${escapeHTML(docenteNombre)}</p>
            </div>
        `;
        container.appendChild(item);
    });
}

// Verifica si hay una sesión iniciada de administrador y su rol
function verificarEstadoSesion() {
    const isLoggedIn = sessionStorage.getItem("adminLoggedIn") === "true";
    const adminRole = sessionStorage.getItem("adminRole");

    const btnCalendario = document.getElementById("tab-calendario-btn");
    const btnLogin = document.getElementById("tab-login-btn");
    const btnLogout = document.getElementById("tab-logout-btn");

    if (isLoggedIn) {
        if (adminRole === "Administrativo") {
            if (btnCalendario) btnCalendario.classList.remove("hidden-tab");
        } else {
            if (btnCalendario) btnCalendario.classList.add("hidden-tab");
        }
        if (btnLogin) btnLogin.classList.add("hidden-tab");
        if (btnLogout) btnLogout.classList.remove("hidden-tab");

        // Si el usuario estaba en calendario y ya no es administrativo, cambiar a citas
        const activeTab = document.querySelector(".nav-tab.active");
        if (activeTab && activeTab.id === "tab-calendario-btn" && adminRole !== "Administrativo") {
            switchTab("citas");
        }
    } else {
        if (btnCalendario) btnCalendario.classList.add("hidden-tab");
        if (btnLogin) btnLogin.classList.remove("hidden-tab");
        if (btnLogout) btnLogout.classList.add("hidden-tab");

        const activeTab = document.querySelector(".nav-tab.active");
        if (activeTab && (activeTab.id === "tab-calendario-btn" || activeTab.id === "tab-logout-btn")) {
            switchTab("agendar");
        }
    }
}

// Envía la petición de login al backend
async function handleLogin(event) {
    event.preventDefault();

    const inputUsuario = document.getElementById("input-login-usuario");
    const inputContrasena = document.getElementById("input-login-contrasena");
    const btnSubmit = document.getElementById("btn-login-submit");

    const errorUsuario = document.getElementById("error-login-usuario");
    const errorContrasena = document.getElementById("error-login-contrasena");

    // Resetear errores
    if (errorUsuario) errorUsuario.textContent = "";
    if (errorContrasena) errorContrasena.textContent = "";

    let isValid = true;
    if (!inputUsuario.value.trim()) {
        if (errorUsuario) errorUsuario.textContent = "El usuario es obligatorio.";
        isValid = false;
    }
    if (!inputContrasena.value.trim()) {
        if (errorContrasena) errorContrasena.textContent = "La contraseña es obligatoria.";
        isValid = false;
    }

    if (!isValid) return;

    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Validando...';

    try {
        const response = await fetch(`${API_BASE_URL}/api/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                usuario: inputUsuario.value.trim(),
                contrasena: inputContrasena.value.trim()
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showToast("Acceso Concedido", "Sesión iniciada con éxito.", "success");
            sessionStorage.setItem("adminLoggedIn", "true");
            sessionStorage.setItem("adminRole", data.rol);

            // Limpiar formulario
            document.getElementById("form-login").reset();

            // Actualizar interfaz
            verificarEstadoSesion();
            switchTab("citas");
        } else {
            showToast("Error de Acceso", data.detail || "Credenciales incorrectas.", "error");
        }
    } catch (error) {
        console.error("Error al iniciar sesión:", error);
        showToast("Error de conexión", "No se pudo conectar con el servidor.", "error");
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Iniciar Sesión';
    }
}

// Cierra la sesión del administrador
function handleLogout() {
    const confirmar = confirm("¿Está seguro de que desea cerrar la sesión?");
    if (confirmar) {
        sessionStorage.removeItem("adminLoggedIn");
        sessionStorage.removeItem("adminRole");
        correoConsultado = null; // Limpiar consulta del acudiente también
        showToast("Sesión Cerrada", "Has salido del panel de administración.", "success");
        verificarEstadoSesion();
        switchTab("agendar");
    }
}

// Funciones de validación para los campos de correo electrónico
function validarCampoCorreo() {
    const inputCorreo = document.getElementById("input-correo");
    if (!inputCorreo) return false;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const value = inputCorreo.value.trim();

    if (value === "") {
        showFieldError("correo", "El correo electrónico es obligatorio.");
        return false;
    } else if (!emailRegex.test(value)) {
        showFieldError("correo", "Ingresa una dirección de correo electrónico válida.");
        return false;
    } else {
        clearError("correo");

        // Si el campo de confirmar correo ya tiene texto, re-validarlo para asegurar coincidencia
        const inputConfirmar = document.getElementById("input-confirmar-correo");
        if (inputConfirmar && inputConfirmar.value.trim() !== "") {
            validarCampoConfirmarCorreo();
        }
        return true;
    }
}

function validarCampoConfirmarCorreo() {
    const inputCorreo = document.getElementById("input-correo");
    const inputConfirmar = document.getElementById("input-confirmar-correo");
    if (!inputConfirmar || !inputCorreo) return false;

    const valCorreo = inputCorreo.value.trim();
    const valConfirmar = inputConfirmar.value.trim();

    if (valConfirmar === "") {
        showFieldError("confirmar-correo", "Por favor confirma tu correo electrónico.");
        return false;
    } else if (valConfirmar !== valCorreo) {
        showFieldError("confirmar-correo", "Los correos electrónicos ingresados no coinciden.");
        return false;
    } else {
        clearError("confirmar-correo");
        return true;
    }
}

// Variables globales para reprogramación de citas
let reprogramarGradoId = null;
let reprogramarHorarioActual = null;

// Obtiene los horarios disponibles para el docente seleccionado en reprogramación
async function obtenerHorariosParaReprogramar(gradoId) {
    const diasGrid = document.getElementById("reprogramar-dias-grid");
    const horasContainer = document.getElementById("reprogramar-horas-container");
    const horariosGrid = document.getElementById("reprogramar-horarios-grid");
    const errorMsg = document.getElementById("error-reprogramar-horario");

    if (errorMsg) errorMsg.textContent = "";

    diasGrid.innerHTML = `
        <div class="no-grado-selected">
            <i class="fa-solid fa-circle-notch fa-spin"></i>
            <span>Cargando horarios disponibles...</span>
        </div>
    `;
    horasContainer.classList.add("hidden");
    horariosGrid.innerHTML = "";

    try {
        const response = await fetch(`${API_BASE_URL}/api/horarios/${gradoId}`);
        if (!response.ok) {
            throw new Error("No se pudieron obtener los horarios del docente.");
        }

        const data = await response.json();
        diasGrid.innerHTML = "";

        if (!data.horarios || data.horarios.length === 0) {
            diasGrid.innerHTML = `
                <div class="no-grado-selected">
                    <i class="fa-regular fa-calendar-times"></i>
                    <span>No hay otros horarios disponibles para este docente.</span>
                </div>
            `;
            return;
        }

        // Agrupar por día
        const horariosPorDia = {};
        data.horarios.forEach(horario => {
            const partes = horario.split(" ");
            const dia = partes[0] + " " + partes[1]; // e.g. "Mié 8/Jul"
            const hora = partes[2]; // e.g. "07:00"
            if (!horariosPorDia[dia]) {
                horariosPorDia[dia] = [];
            }
            horariosPorDia[dia].push({ horario_completo: horario, hora: hora });
        });

        // Renderizar días
        Object.keys(horariosPorDia).forEach(dia => {
            const dayBtn = document.createElement("button");
            dayBtn.type = "button";
            dayBtn.className = "btn-dia";
            dayBtn.innerHTML = `<i class="fa-regular fa-calendar-check"></i> ${formatearDiaCompleto(dia)}`;

            dayBtn.addEventListener("click", (e) => {
                // Quitar clase activa de otros botones
                diasGrid.querySelectorAll(".btn-dia").forEach(btn => btn.classList.remove("active"));
                e.currentTarget.classList.add("active");

                // Mostrar grid de horas
                horasContainer.classList.remove("hidden");
                horariosGrid.innerHTML = "";

                // Renderizar horas
                horariosPorDia[dia].forEach((item, index) => {
                    const optionContainer = document.createElement("label");
                    optionContainer.className = "horario-option";

                    const radioInput = document.createElement("input");
                    radioInput.type = "radio";
                    radioInput.name = "reprogramar-horario-seleccionado";
                    radioInput.value = item.horario_completo;
                    radioInput.id = `reprogramar-horario-${index}`;
                    radioInput.addEventListener("change", () => {
                        if (errorMsg) errorMsg.textContent = "";
                    });

                    const chipDiv = document.createElement("div");
                    chipDiv.className = "horario-chip";

                    const timeSpan = document.createElement("span");
                    timeSpan.className = "horario-time";
                    timeSpan.textContent = item.hora;

                    chipDiv.appendChild(timeSpan);
                    optionContainer.appendChild(radioInput);
                    optionContainer.appendChild(chipDiv);

                    horariosGrid.appendChild(optionContainer);
                });
            });

            diasGrid.appendChild(dayBtn);
        });

    } catch (error) {
        console.error("Error al cargar horarios para reprogramar:", error);
        diasGrid.innerHTML = `
            <div class="no-grado-selected">
                <i class="fa-solid fa-circle-exclamation" style="color: var(--color-danger)"></i>
                <span>Error al cargar horarios disponibles.</span>
            </div>
        `;
        showToast("Error", error.message, "error");
    }
}

// Maneja el cambio de docente/grado en el modal de reprogramación
function handleReprogramarGradoChange() {
    const selectReprogramarGrado = document.getElementById("select-reprogramar-grado");
    if (selectReprogramarGrado) {
        obtenerHorariosParaReprogramar(selectReprogramarGrado.value);
    }
}

// Carga los horarios disponibles para el docente de la cita a reprogramar
async function cargarHorariosReprogramar(gradoId, horarioActual) {
    reprogramarGradoId = gradoId;
    reprogramarHorarioActual = horarioActual;

    const modal = document.getElementById("modal-reprogramar");
    const selectReprogramarGrado = document.getElementById("select-reprogramar-grado");

    if (selectReprogramarGrado) {
        selectReprogramarGrado.innerHTML = "";
        gradosDisponibles.forEach(g => {
            const option = document.createElement("option");
            option.value = g.grado;
            option.textContent = `${g.area} - ${g.docente}`;
            selectReprogramarGrado.appendChild(option);
        });
        selectReprogramarGrado.value = gradoId;
    }

    if (modal) {
        modal.classList.remove("hidden");
    }

    await obtenerHorariosParaReprogramar(gradoId);
}

// Cierra el modal de reprogramación
function cerrarModalReprogramar() {
    const modal = document.getElementById("modal-reprogramar");
    if (modal) {
        modal.classList.add("hidden");
    }
    reprogramarGradoId = null;
    reprogramarHorarioActual = null;
}

// Envía la petición PUT para confirmar la reprogramación de la cita
async function submitReprogramar() {
    const errorMsg = document.getElementById("error-reprogramar-horario");
    const selectedRadio = document.querySelector('input[name="reprogramar-horario-seleccionado"]:checked');
    const selectReprogramarGrado = document.getElementById("select-reprogramar-grado");

    if (!selectedRadio) {
        if (errorMsg) {
            errorMsg.textContent = "Por favor, seleccione un nuevo horario.";
        }
        return;
    }

    const nuevoHorario = selectedRadio.value;
    const gradoNuevo = selectReprogramarGrado ? selectReprogramarGrado.value : reprogramarGradoId;
    const btnSubmit = document.getElementById("btn-submit-reprogramar");

    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Procesando...';
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/citas/reprogramar`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                grado_actual: reprogramarGradoId,
                grado_nuevo: gradoNuevo,
                horario_actual: reprogramarHorarioActual,
                horario_nuevo: nuevoHorario
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showToast("Cita Reprogramada", "El agendamiento ha sido reprogramado con éxito.", "success");
            cerrarModalReprogramar();
            await refrescarCitas();
        } else {
            showToast("No se pudo reprogramar", data.detail || "Error al reprogramar la cita.", "error");
        }
    } catch (error) {
        console.error("Error al reprogramar la cita:", error);
        showToast("Error de conexión", "No se pudo establecer comunicación con el servidor.", "error");
    } finally {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = "Confirmar Reprogramación";
        }
    }
}

// Actualiza el listado según el estado de la sesión (público filtrado o admin total)
async function refrescarCitas() {
    const isLoggedIn = sessionStorage.getItem("adminLoggedIn") === "true";
    if (isLoggedIn) {
        await cargarCitas();
    } else if (correoConsultado) {
        await cargarCitas(correoConsultado);
    } else {
        await cargarCitas();
    }
}

// Consulta las citas asociadas al correo del acudiente (flujo público)
async function handleConsultarCitas(event) {
    event.preventDefault();
    const inputCorreo = document.getElementById("input-consulta-correo");
    const errorMsg = document.getElementById("error-consulta-correo");

    if (errorMsg) errorMsg.textContent = "";

    const correo = inputCorreo.value.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!correo) {
        if (errorMsg) errorMsg.textContent = "El correo electrónico es obligatorio.";
        return;
    }

    if (!emailRegex.test(correo)) {
        if (errorMsg) errorMsg.textContent = "Ingrese un correo electrónico válido.";
        return;
    }

    const btnSubmit = document.getElementById("btn-consulta-submit");
    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Consultando...';
    }

    try {
        correoConsultado = correo;
        await cargarCitas(correo);

        // Ocultar formulario de consulta y mostrar resultados
        const consultaCont = document.getElementById("citas-consulta-container");
        const resultadosCont = document.getElementById("citas-resultados-container");
        const subtitle = document.getElementById("citas-resultados-subtitle");
        const btnCambiar = document.getElementById("btn-cambiar-consulta-correo");
        const emptyText = document.getElementById("citas-empty-text");

        if (consultaCont) consultaCont.classList.add("hidden");
        if (resultadosCont) resultadosCont.classList.remove("hidden");
        if (subtitle) subtitle.textContent = `Mostrando citas asociadas al correo: ${correo}`;
        if (btnCambiar) btnCambiar.style.display = "inline-block";
        if (emptyText) emptyText.textContent = `No se encontraron agendamientos asociados al correo: ${correo}.`;

    } catch (error) {
        console.error("Error al consultar citas:", error);
        showToast("Error de conexión", "No se pudo completar la consulta.", "error");
    } finally {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Consultar Citas';
        }
    }
}

// Vuelve a mostrar el formulario de consulta de correo
function mostrarFormConsulta() {
    correoConsultado = null;
    const inputCorreo = document.getElementById("input-consulta-correo");
    if (inputCorreo) inputCorreo.value = "";

    const consultaCont = document.getElementById("citas-consulta-container");
    const resultadosCont = document.getElementById("citas-resultados-container");

    if (consultaCont) consultaCont.classList.remove("hidden");
    if (resultadosCont) resultadosCont.classList.add("hidden");

    // Limpiar badge
    const badge = document.getElementById("citas-badge");
    if (badge) badge.textContent = "0";
}


