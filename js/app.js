// Configuración global de la API del backend
// Por defecto apunta a localhost:8000 que es la dirección estándar para uvicorn
const API_BASE_URL = "http://127.0.0.1:8000";

// Variables de estado de la aplicación
let gradosDisponibles = [];
let todasLasCitas = [];

// ==========================================================================
// INICIALIZACIÓN DE LA APLICACIÓN
// La función cerrarModal() se define en el script inline del HTML (en el <head>)
// para garantizar disponibilidad inmediata antes de la carga de este archivo.
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
    // Carga inicial de grados para el selector del formulario
    cargarGrados();

    // Carga de agendamientos registrados para mantener actualizado el dashboard
    cargarCitas();

    // Establecer la sección inicial (Nuevo Agendamiento)
    switchTab("agendar");

    // El modal de instrucciones se muestra automaticamente al ingresar a la pagina
    // Se cierra cuando el usuario hace clic en el boton de confirmacion
});

// ==========================================================================
// NAVEGACIÓN Y TABS
// ==========================================================================
function switchTab(tabName) {
    // Obtener elementos
    const tabAgendar = document.getElementById("section-agendar");
    const tabCitas = document.getElementById("section-citas");
    const btnAgendar = document.getElementById("tab-agendar-btn");
    const btnCitas = document.getElementById("tab-citas-btn");

    if (tabName === "agendar") {
        tabAgendar.classList.add("active");
        tabCitas.classList.remove("active");
        btnAgendar.classList.add("active");
        btnCitas.classList.remove("active");
        // Recargar horarios si hay un grado seleccionado
        const selectGrado = document.getElementById("select-grado");
        if (selectGrado.value) {
            handleGradoChange();
        }
    } else if (tabName === "citas") {
        tabAgendar.classList.remove("active");
        tabCitas.classList.add("active");
        btnAgendar.classList.remove("active");
        btnCitas.classList.add("active");
        // Recargar citas al cambiar de pestaña
        cargarCitas();
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
            option.textContent = `${g.area} (Grupo ${g.grupo}) - Docente: ${g.docente}`;
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
    const docenteGrupo = document.getElementById("docente-grupo");
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

        // Buscar el grupo del grado seleccionado para mostrarlo en el cuadro
        const gradoDetalle = gradosDisponibles.find(g => g.grado === gradoId);
        const grupoLabel = gradoDetalle ? `Grupo: ${gradoDetalle.grupo}` : "Grupo: N/A";

        // Actualizar información del docente
        docenteNombre.textContent = data.docente;
        docenteGrupo.textContent = grupoLabel;
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
            dayBtn.innerHTML = `<i class="fa-regular fa-calendar-check"></i> ${dia}`;

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
async function cargarCitas() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/citas`);
        if (!response.ok) {
            throw new Error("No se pudo obtener la lista de citas.");
        }

        todasLasCitas = await response.json();

        // Actualizar el número de la pestaña de citas
        document.getElementById("citas-badge").textContent = todasLasCitas.length;

        // Renderizar en el listado
        renderizarCitas(todasLasCitas);

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
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inputCorreo.value.trim())) {
        showFieldError("correo", "Ingresa una dirección de correo electrónico válida.");
        isFormValid = false;
    } else {
        clearError("correo");
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
        const grupoNombre = gradoDetalle ? `(Grupo ${gradoDetalle.grupo})` : "";

        const card = document.createElement("div");
        card.className = "cita-card";

        card.innerHTML = `
            <div class="cita-card-header">
                <div class="student-info">
                    <span class="student-name">${escapeHTML(cita.estudiante)}</span>
                    <span class="student-grade">${escapeHTML(areaNombre)} ${escapeHTML(grupoNombre)}</span>
                </div>
                <span class="cita-card-badge">Matricula Agendada</span>
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
                <span>${escapeHTML(cita.horario)}</span>
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
