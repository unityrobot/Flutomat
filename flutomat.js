/**
 * @fileoverview Flutomat NG - Modernized Flute Calculator
 * Calculates transverse flute finger hole and embouchure positions based on
 * acoustic principles, incorporating temperature-dependent speed of sound.
 */

/**
 * Represents and calculates flute dimensions.
 * @class
 */
class FluteCalculator {
    /**
     * Initializes the calculator and sets up UI listeners.
     */
    constructor() {
        /** @const {number} Number of finger holes (fixed in this implementation) */
        this.HOLE_COUNT = 6;

        /** @const {number} Standard conversion */
        this.CM_TO_INCH = 0.3937008;

        // --- Configuration Constants ---
        /** @const {number} Standard acoustic end correction factor (dimensionless). */
        this.END_CORRECTION_FACTOR = 0.6133;
        /** @const {number} Factor for effective hole height extension (dimensionless). */
        this.HOLE_HEIGHT_EXTENSION_FACTOR = 0.75;
        /** @const {number} MIDI note number for A4 tuning reference. */
        this.MIDI_A4_NOTE = 69;
        /** @const {number} Frequency of A4 tuning reference (Hz). */
        this.A4_FREQUENCY_HZ = 440.0;
        /** @const {number[]} Major scale intervals in semitones relative to root [Root, M2, M3, P4, P5, M6, M7]. */
        this.MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11]; // Used for Fend, Hole1..6

        // --- DOM Element References ---
        this.form = document.getElementById('fluteForm');
        this.unitInputs = document.querySelectorAll('input[name="units"]');
        this.tempInput = document.getElementById('temperature');
        this.tempUnitSelect = document.getElementById('tempUnit');
        this.speedOfSoundDisplay = document.getElementById('speedOfSoundDisplay');
        this.boreDiameterInput = document.getElementById('boreDiameter');
        this.wallThicknessInput = document.getElementById('wallThickness');
        this.embouchureDiameterInput = document.getElementById('embouchureDiameter');
        this.endFrequencyInput = document.getElementById('endFrequency');
        this.keySelector = document.getElementById('keySelector');
        this.calculateButton = document.getElementById('calculateButton');
        this.resetButton = document.getElementById('resetButton');
        this.resultEmbouchureOutput = document.getElementById('resultEmbouchure');
        this.resultEndOutput = document.getElementById('resultEnd');

        /** @type {HTMLInputElement[]} */
        this.holeFrequencyInputs = [];
        /** @type {HTMLInputElement[]} */
        this.holeDiameterInputs = [];
        /** @type {HTMLOutputElement[]} */
        this.holeResultOutputs = [];
        document.querySelectorAll('.hole-row').forEach(row => {
            const index = parseInt(row.dataset.holeIndex, 10);
            // Store in reverse order of display (index 0 = lowest pitch hole 1)
            this.holeFrequencyInputs[index] = row.querySelector('input[name="holeFrequency"]');
            this.holeDiameterInputs[index] = row.querySelector('input[name="holeDiameter"]');
            this.holeResultOutputs[index] = row.querySelector('output[name="resultHole"]');
        });

        // --- Internal State Variables ---
        /** @type {'cm' | 'inches'} The unit system currently selected. */
        this.units = 'inches';
        /** @type {number} Ambient temperature in Celsius. */
        this.temperatureCelsius = 20;
        /** @type {number} Speed of sound in the current unit system (cm/s or inches/s). */
        this.speedOfSound = 0;
        /** @type {number} Flute bore inner diameter in current units. */
        this.boreDiameter = 0;
        /** @type {number} Flute wall thickness in current units. */
        this.wallThickness = 0;
        /** @type {number} Embouchure hole diameter in current units. */
        this.embouchureDiameter = 0;
        /** @type {number} Target frequency for the fundamental note (all holes closed) in Hz. */
        this.endFrequency = 0;
        /**
         * @typedef {object} FluteHole
         * @property {number} frequency - Target frequency in Hz when this is the first open hole.
         * @property {number} diameter - Diameter of the hole in current units.
         * @property {number} acousticPosition - Calculated acoustic distance from the theoretical start of the air column.
         * @property {number} physicalPosition - Calculated physical distance from the open end of the flute.
         */
        /** @type {FluteHole[]} Array storing data for each finger hole (index 0 = hole 1 lowest pitch). */
        this.holes = [];

        /** @type {number} Calculated acoustic distance of the effective end of the flute from the theoretical start. */
        this.acousticEndX = 0;
        /** @type {number} Calculated acoustic distance of the embouchure center from the theoretical start. */
        this.embouchureAcousticX = 0;
        /** @type {number} Calculated physical distance of the embouchure center from the open end. */
        this.embouchurePhysicalPosition = 0;

        this._bindEvents();
        this.readInputsFromForm(); // Load initial values
        this.updateSpeedOfSoundDisplay(); // Show initial speed of sound
        this.updateFrequenciesFromKey(); // Set initial frequencies based on default key
    }

    /**
     * Binds event listeners to form elements.
     * @private
     */
    _bindEvents() {
        this.form.addEventListener('submit', (e) => {
            e.preventDefault(); // Prevent actual form submission
            this.calculateAllPositions();
        });

        // Use 'input' event for immediate feedback on temp/unit changes
        this.tempInput.addEventListener('input', () => this._handleTemperatureChange());
        this.tempUnitSelect.addEventListener('input', () => this._handleTemperatureChange());
        this.unitInputs.forEach(input => {
            input.addEventListener('change', () => this._handleUnitChange());
        });

        this.keySelector.addEventListener('change', () => this.updateFrequenciesFromKey());

        // Allow recalculation if diameters change (optional, could require explicit button press)
        // this.boreDiameterInput.addEventListener('input', () => this.displayResultsInForm()); // Or trigger calc
        // this.wallThicknessInput.addEventListener('input', () => this.displayResultsInForm());
        // this.embouchureDiameterInput.addEventListener('input', () => this.displayResultsInForm());
        // this.holeDiameterInputs.forEach(input => input.addEventListener('input', () => this.displayResultsInForm()));

        // Reset handling
        this.resetButton.addEventListener('click', () => {
            // Note: type="reset" does basic reset. We might want custom default logic here
            // For now, rely on browser reset and then re-init state
            setTimeout(() => {
                this.readInputsFromForm();
                this.updateSpeedOfSoundDisplay();
                this.updateFrequenciesFromKey(); // Ensure frequencies match reset key
                this.clearResults();
            }, 0); // Allow form reset to happen first
        });
    }

    /** Handles changes in the temperature input or units. */
    _handleTemperatureChange() {
        this.readTemperatureInput();
        this.updateSpeedOfSoundDisplay();
        // Maybe trigger recalculation or just update display
        // this.calculateAllPositions(); // Uncomment to auto-recalculate
    }

    /** Handles changes in the unit selection. */
    _handleUnitChange() {
        this.readUnitsInput();
        this.updateSpeedOfSoundDisplay();
        this.updateUnitsBasedInputs();
        // Potentially convert existing values if needed, or require re-input/recalc
        this.clearResults(); // Clear old results as they are likely invalid
    }

    updateUnitsBasedInputs() {
        const isCm = this.units === 'cm';
        const ratio = (isCm ? (1 / this.CM_TO_INCH) : this.CM_TO_INCH);
        const digits = isCm ? 2 : 3;
        this.wallThicknessInput.value = (Number(this.wallThicknessInput.value) * ratio).toFixed(digits);
        this.boreDiameterInput.value = (Number(this.boreDiameterInput.value) * ratio).toFixed(digits);
        this.embouchureDiameterInput.value = (Number(this.embouchureDiameterInput.value) * ratio).toFixed(digits);
        for (let i = 0; i < this.HOLE_COUNT; i++) {
            this.holeDiameterInputs[i].value = (Number(this.holeDiameterInputs[i].value) * ratio).toFixed(digits);
        }
    }

    /**
     * Reads all input values from the form into the calculator's state.
     * Performs basic validation.
     * @returns {boolean} True if all inputs are valid, false otherwise.
     */
    readInputsFromForm() {
        let isValid = true;

        this.readUnitsInput(); // Read units first
        this.readTemperatureInput(); // Read temperature

        const parseAndValidate = (inputElement, propertyName, isPositive = true) => {
            const value = parseFloat(inputElement.value);
            if (isNaN(value) || (isPositive && value <= 0)) {
                inputElement.style.borderColor = 'red'; // Basic validation feedback
                isValid = false;
                console.error(`Invalid value for ${propertyName}: ${inputElement.value}`);
                this[propertyName] = NaN; // Set internal state to invalid
            } else {
                inputElement.style.borderColor = ''; // Clear error state
                this[propertyName] = value;
            }
        };

        parseAndValidate(this.boreDiameterInput, 'boreDiameter');
        parseAndValidate(this.wallThicknessInput, 'wallThickness');
        parseAndValidate(this.embouchureDiameterInput, 'embouchureDiameter');
        parseAndValidate(this.endFrequencyInput, 'endFrequency');

        // Read hole data
        this.holes = [];
        for (let i = 0; i < this.HOLE_COUNT; i++) {
            const freqInput = this.holeFrequencyInputs[i];
            const diamInput = this.holeDiameterInputs[i];
            const freq = parseFloat(freqInput.value);
            const diam = parseFloat(diamInput.value);

            let holeValid = true;
            if (isNaN(freq) || freq <= 0) {
                freqInput.style.borderColor = 'red';
                isValid = false;
                holeValid = false;
                console.error(`Invalid frequency for hole ${i + 1}: ${freqInput.value}`);
            } else {
                freqInput.style.borderColor = '';
            }

            if (isNaN(diam) || diam <= 0) {
                diamInput.style.borderColor = 'red';
                isValid = false;
                holeValid = false;
                console.error(`Invalid diameter for hole ${i + 1}: ${diamInput.value}`);
            } else {
                diamInput.style.borderColor = '';
            }

            this.holes[i] = {
                frequency: holeValid ? freq : NaN,
                diameter: holeValid ? diam : NaN,
                acousticPosition: NaN,
                physicalPosition: NaN,
            };
        }
        if (!isValid) {
            alert("Invalid input detected. Please correct the highlighted fields.");
        }

        return isValid;
    }

    /** Reads the selected unit system from the radio buttons. */
    readUnitsInput() {
        const selectedUnit = document.querySelector('input[name="units"]:checked');
        this.units = selectedUnit ? selectedUnit.value : 'inches'; // Default to inches if none selected
    }

    /** Reads temperature value and unit, stores temperature in Celsius. */
    readTemperatureInput() {
        const tempValue = parseFloat(this.tempInput.value);
        const tempUnit = this.tempUnitSelect.value;

        if (isNaN(tempValue)) {
            this.temperatureCelsius = 20; // Default on error
            console.error("Invalid temperature input");
            this.tempInput.style.borderColor = 'red';
            return; // Keep last valid speed of sound? Or set to NaN?
        } else {
            this.tempInput.style.borderColor = '';
        }

        if (tempUnit === 'F') {
            this.temperatureCelsius = (tempValue - 32) * 5 / 9;
        } else {
            this.temperatureCelsius = tempValue;
        }
        this.calculateSpeedOfSound(); // Update speed of sound whenever temp changes
    }

    /**
     * Calculates the speed of sound based on temperature and selected units.
     * Formula: V = 331.3 * sqrt(1 + TempC / 273.15) m/s
     */
    calculateSpeedOfSound() {
        const speedOfSoundMps = 331.3 * Math.sqrt(1 + this.temperatureCelsius / 273.15);

        if (this.units === 'cm') {
            this.speedOfSound = speedOfSoundMps * 100; // m/s to cm/s
        } else { // inches
            this.speedOfSound = speedOfSoundMps * 39.3701; // m/s to inches/s
        }
        // Check if speed is valid before updating display
        if (isNaN(this.speedOfSound)) {
            console.error("Could not calculate speed of sound.");
            this.speedOfSoundDisplay.textContent = "Speed of Sound: Error";
            this.speedOfSound = NaN; // Ensure invalid state propagates
        } else {
            this.updateSpeedOfSoundDisplay();
        }

    }

    /** Updates the displayed speed of sound value. */
    updateSpeedOfSoundDisplay() {
        if (!isNaN(this.speedOfSound)) {
            this.speedOfSoundDisplay.textContent = `Speed of Sound: ${this.speedOfSound.toFixed(1)} ${this.units}/s`;
        } else {
            this.speedOfSoundDisplay.textContent = "Speed of Sound: Calculation Error";
        }
    }


    /**
     * Converts a MIDI note number to frequency in Hz.
     * Uses A4 = 440 Hz = MIDI note 69.
     * @param {number} midiNote - The MIDI note number.
     * @returns {number} The frequency in Hz.
     */
    midiNoteToFrequency(midiNote) {
        return this.A4_FREQUENCY_HZ * Math.pow(2, (midiNote - this.MIDI_A4_NOTE) / 12.0);
    }

    /**
     * Updates the frequency input fields based on the selected key (lowest note)
     * and a standard major scale pattern.
     */
    updateFrequenciesFromKey() {
        const baseMidiNote = parseInt(this.keySelector.value, 10);
        if (isNaN(baseMidiNote)) {
            console.error("Invalid key selected.");
            return;
        }

        // Calculate frequencies based on major scale intervals relative to the base note
        const endFreq = this.midiNoteToFrequency(baseMidiNote + this.MAJOR_SCALE_INTERVALS[0]);
        this.endFrequencyInput.value = endFreq.toFixed(2);

        for (let i = 0; i < this.HOLE_COUNT; i++) {
            // intervals[0] is for endFreq, so holes use intervals[1] through intervals[HOLE_COUNT]
            const holeFreq = this.midiNoteToFrequency(baseMidiNote + this.MAJOR_SCALE_INTERVALS[i + 1]);
            if (this.holeFrequencyInputs[i]) { // Check if element exists
                this.holeFrequencyInputs[i].value = holeFreq.toFixed(2);
            }
        }
        // After updating UI, re-read the values into internal state (optional, depends on flow)
        // this.readInputsFromForm();
    }

    // --- Acoustic Calculation Functions (Ported and Renamed) ---

    /**
     * Calculates the effective wall thickness (height of air column at open hole).
     * Formula: t_e = wall + 0.75 * hole_diameter
     * @param {number} holeIndex - The 0-based index of the hole.
     * @returns {number} The effective thickness in current units. Returns NaN if input invalid.
     */
    calculateEffectiveHoleHeight(holeIndex) {
        const diameter = this.holes[holeIndex]?.diameter;
        if (isNaN(this.wallThickness) || isNaN(diameter)) return NaN;
        return this.wallThickness + this.HOLE_HEIGHT_EXTENSION_FACTOR * diameter;
    }

    /**
     * Calculates the closed hole correction for a given hole.
     * This length is added for each closed hole above the first open one.
     * Formula: C_c = 0.25 * wall * (hole_diameter / bore_diameter)^2
     * @param {number} holeIndex - The 0-based index of the hole.
     * @returns {number} The closed hole length correction in current units. Returns NaN if input invalid.
     */
    calculateClosedHoleCorrection(holeIndex) {
        const diameter = this.holes[holeIndex]?.diameter;
        if (isNaN(this.wallThickness) || isNaN(diameter) || isNaN(this.boreDiameter) || this.boreDiameter === 0) {
            return NaN;
        }
        const ratio = diameter / this.boreDiameter;
        return 0.25 * this.wallThickness * ratio * ratio;
    }

    /**
     * Calculates the open end correction.
     * Distance from physical end to effective acoustic end.
     * Formula: C_end = 0.6133 * bore_radius
     * @returns {number} The end correction length in current units. Returns NaN if input invalid.
     */
    calculateEndCorrection() {
        if (isNaN(this.boreDiameter)) return NaN;
        return this.END_CORRECTION_FACTOR * (this.boreDiameter / 2.0);
    }

    /**
     * Calculates the effective distance correction for the *first* open tone hole.
     * Uses Benade's formula involving impedance.
     * Formula: C_s = te(1) / ( (D(1)/Bore)^2 + te(1)/(Xend - Xf(1)) )
     * Note: This formula involves Xf(1) which is what we are trying to find, hence the iterative/quadratic approach.
     * This method is primarily for understanding; the quadratic solver incorporates this logic directly.
     * @param {number} acousticLengthX - The target acoustic length for the first hole note (Vsound / (2 * F1)).
     * @param {number} currentGuessXf1 - The current estimate for the first hole's acoustic position.
     * @returns {number} The first hole correction length. Returns NaN if input invalid.
     */
    calculateFirstHoleCorrection_Iterative(acousticLengthX, currentGuessXf1) {
        const holeIndex = 0; // First hole
        const te_1 = this.calculateEffectiveHoleHeight(holeIndex);
        const diameter = this.holes[holeIndex]?.diameter;

        if (isNaN(te_1) || isNaN(diameter) || isNaN(this.boreDiameter) || isNaN(this.acousticEndX) || isNaN(currentGuessXf1) || this.boreDiameter === 0) {
            return NaN;
        }

        const boreRatioSq = (diameter / this.boreDiameter) * (diameter / this.boreDiameter);
        const lengthDiff = this.acousticEndX - currentGuessXf1;

        // Avoid division by zero or near-zero issues
        if (Math.abs(lengthDiff) < 1e-9) return NaN; // Or handle appropriately

        return te_1 / (boreRatioSq + te_1 / lengthDiff);
    }

    /**
     * Calculates the effective distance correction for subsequent open tone holes (lattice correction).
     * Formula: C_o(n) = ((Xf(n-1)-Xf(n))/2) * (sqrt(1 + 4*(te(n)/(Xf(n-1)-Xf(n)))*(Bore/D(n))^2) - 1)
     * Similar to C_s, this depends on Xf(n), making it part of the iterative/quadratic solution.
     * This method is primarily for understanding.
     * @param {number} holeIndex - The 0-based index of the current hole (n >= 1).
     * @param {number} currentGuessXfn - The current estimate for this hole's acoustic position.
     * @returns {number} The subsequent hole correction length. Returns NaN if input invalid.
     */
    calculateSubsequentHoleCorrection_Iterative(holeIndex, currentGuessXfn) {
        if (holeIndex < 1) return NaN; // Only for holes 2 onwards (index 1+)

        const te_n = this.calculateEffectiveHoleHeight(holeIndex);
        const diameter_n = this.holes[holeIndex]?.diameter;
        const prevHolePos = this.holes[holeIndex - 1]?.acousticPosition; // Requires previous hole already calculated

        if (isNaN(te_n) || isNaN(diameter_n) || isNaN(prevHolePos) || isNaN(currentGuessXfn) || isNaN(this.boreDiameter) || diameter_n === 0) {
            return NaN;
        }

        const holeSpacing = prevHolePos - currentGuessXfn;
        // Avoid division by zero or sqrt of negative
        if (Math.abs(holeSpacing) < 1e-9) return NaN;

        const bore_d_ratio_sq = (this.boreDiameter / diameter_n) * (this.boreDiameter / diameter_n);
        const term = 4 * (te_n / holeSpacing) * bore_d_ratio_sq;

        if (1 + term < 0) return NaN; // Avoid sqrt of negative

        return (holeSpacing / 2.0) * (Math.sqrt(1.0 + term) - 1.0);
    }


    /**
     * Calculates the embouchure correction using Kosel's empirical fit.
     * This represents the distance from the theoretical start of the air column to the effective acoustic center of the embouchure.
     * Formula: C_emb = (Bore/Demb)^2 * 10.84 * wall * Demb / (Bore + 2*wall)
     * @returns {number} The embouchure correction length. Returns NaN if input invalid.
     */
    calculateEmbouchureCorrection() {
        if (isNaN(this.boreDiameter) || isNaN(this.embouchureDiameter) || isNaN(this.wallThickness) ||
            this.embouchureDiameter === 0 || (this.boreDiameter + 2 * this.wallThickness) === 0) {
            return NaN;
        }
        const bore_demb_ratio_sq = (this.boreDiameter / this.embouchureDiameter) * (this.boreDiameter / this.embouchureDiameter);
        const numerator = 10.84 * this.wallThickness * this.embouchureDiameter;
        const denominator = this.boreDiameter + 2.0 * this.wallThickness;

        return bore_demb_ratio_sq * numerator / denominator;
    }

    /**
     * Calculates all hole positions using the non-iterative quadratic solution method.
     * Based on Benade's equations after algebraic manipulation.
     * Updates the `acousticPosition` property for each hole and `acousticEndX`, `embouchureAcousticX`.
     * @returns {boolean} True if calculation was successful, false otherwise.
     */
    calculateHolePositions_Quadratic() {
        // Ensure speed of sound is valid
        if (isNaN(this.speedOfSound) || this.speedOfSound <= 0) {
            console.error("Cannot calculate positions: Invalid speed of sound.");
            return false;
        }

        // 0. Preliminary calculations and validation
        let closedHoleCorrections = [];
        for (let i = 0; i < this.HOLE_COUNT; i++) {
            const chc = this.calculateClosedHoleCorrection(i);
            if (isNaN(chc)) {
                console.error(`Cannot calculate positions: Invalid input for closed hole correction ${i + 1}.`);
                return false;
            }
            closedHoleCorrections[i] = chc;
        }

        const endCorrection = this.calculateEndCorrection();
        if (isNaN(endCorrection)) {
            console.error("Cannot calculate positions: Invalid input for end correction.");
            return false;
        }

        // 1. Calculate effective acoustic end position (Xend)
        // Raw length based on fundamental frequency
        if (isNaN(this.endFrequency) || this.endFrequency <= 0) {
            console.error("Cannot calculate positions: Invalid end frequency.");
            return false;
        }
        let targetAcousticLengthEnd = this.speedOfSound * 0.5 / this.endFrequency;
        // Apply corrections
        this.acousticEndX = targetAcousticLengthEnd - endCorrection;
        for (let i = 0; i < this.HOLE_COUNT; i++) {
            this.acousticEndX -= closedHoleCorrections[i];
        }
        if (isNaN(this.acousticEndX)) {
            console.error("Calculation failed: Acoustic End Position is NaN.");
            return false;
        }

        // 2. Calculate first finger hole position (Xf[0] or Xf(1) in original)
        const holeIndex1 = 0;
        const te_1 = this.calculateEffectiveHoleHeight(holeIndex1);
        const diameter1 = this.holes[holeIndex1].diameter;
        const freq1 = this.holes[holeIndex1].frequency;
        if (isNaN(te_1) || isNaN(diameter1) || isNaN(freq1) || freq1 <= 0) {
            console.error("Cannot calculate positions: Invalid input for hole 1.");
            return false;
        }

        let L1 = this.speedOfSound * 0.5 / freq1;
        // Subtract corrections for *closed* holes above hole 1 (i.e., holes 2 to N)
        for (let i = holeIndex1 + 1; i < this.HOLE_COUNT; i++) {
            L1 -= closedHoleCorrections[i];
        }
        if (isNaN(L1)) {
            console.error("Calculation failed: L1 is NaN.");
            return false;
        }

        // Quadratic solution for Xf[0] derived from Benade's impedance matching
        const a1_term = (diameter1 / this.boreDiameter) * (diameter1 / this.boreDiameter);
        const a1 = a1_term;
        const b1 = -(this.acousticEndX + L1) * a1_term;
        const c1 = this.acousticEndX * L1 * a1_term + te_1 * (L1 - this.acousticEndX);

        const discriminant1 = (b1 * b1) - 4 * a1 * c1;
        if (discriminant1 < 0 || a1 === 0) {
            console.error("Calculation failed: Cannot solve quadratic for hole 1 (discriminant < 0 or a=0).", { a1, b1, c1, discriminant1 });
            return false;
        }
        // We expect Xf[0] < L1 and Xf[0] < Xend. The solution using the minus sign usually yields the physically correct result.
        this.holes[holeIndex1].acousticPosition = (-b1 - Math.sqrt(discriminant1)) / (2 * a1);
        if (isNaN(this.holes[holeIndex1].acousticPosition)) {
            console.error("Calculation failed: Acoustic position for hole 1 is NaN.");
            return false;
        }


        // 3. Calculate subsequent finger hole positions (Xf[1] to Xf[N-1])
        for (let n = 1; n < this.HOLE_COUNT; n++) { // n is the current hole index (0-based)
            const te_n = this.calculateEffectiveHoleHeight(n);
            const diameter_n = this.holes[n].diameter;
            const freq_n = this.holes[n].frequency;
            const prevHolePos = this.holes[n - 1].acousticPosition; // Xf[n-1]

            if (isNaN(te_n) || isNaN(diameter_n) || isNaN(freq_n) || freq_n <= 0 || isNaN(prevHolePos)) {
                console.error(`Calculation failed: Invalid input for hole ${n + 1}.`);
                return false;
            }

            let Ln = this.speedOfSound * 0.5 / freq_n;
            // Subtract corrections for closed holes above hole n (i.e., holes n+1 to N)
            for (let i = n + 1; i < this.HOLE_COUNT; i++) {
                Ln -= closedHoleCorrections[i];
            }
            if (isNaN(Ln)) {
                console.error(`Calculation failed: Ln for hole ${n + 1} is NaN.`);
                return false;
            }

            // Quadratic solution for Xf[n], derived from Benade's lattice correction formula
            // Rearranging C_o(n) = Xf[n-1] - Xf[n] - Ln leads to a quadratic in Xf[n]
            // Original formula: C_o(n) = ((Xf[n-1]-Xf[n])/2)*(sqrt(1+4*(te(n)/(Xf(n-1)-Xf[n]))*(Bore/D(n))^2)-1)
            // Substitute C_o(n) = Xf[n-1] - Xf[n] - Ln and solve for Xf[n].
            // The provided quadratic coefficients in the original code were:
            // a = 2;
            // b = - Xf[n-1] - 3*L + te(n)*(Bore/D(n))^2;
            // c = Xf[n-1]*(L - te(n)*(Bore/D(n))^2) + (L*L);
            // Let's re-verify or trust the original derivation for now.
            if (diameter_n === 0) {
                console.error(`Calculation failed: Diameter for hole ${n + 1} cannot be zero.`);
                return false;
            }
            const bore_d_ratio_sq = (this.boreDiameter / diameter_n) * (this.boreDiameter / diameter_n);
            const a_n = 2.0;
            const b_n = -prevHolePos - 3.0 * Ln + te_n * bore_d_ratio_sq;
            const c_n = prevHolePos * (Ln - te_n * bore_d_ratio_sq) + (Ln * Ln);

            const discriminant_n = (b_n * b_n) - 4.0 * a_n * c_n;
            if (discriminant_n < 0) {
                console.error(`Calculation failed: Cannot solve quadratic for hole ${n + 1} (discriminant < 0).`, { a_n, b_n, c_n, discriminant_n });
                return false;
            }
            // Expect Xf[n] < Ln and Xf[n] < Xf[n-1]. The minus sign solution is typically correct.
            this.holes[n].acousticPosition = (-b_n - Math.sqrt(discriminant_n)) / (2.0 * a_n);
            if (isNaN(this.holes[n].acousticPosition)) {
                console.error(`Calculation failed: Acoustic position for hole ${n + 1} is NaN.`);
                return false;
            }
        }

        // 4. Calculate embouchure effective acoustic location (Xemb)
        this.embouchureAcousticX = this.calculateEmbouchureCorrection();
        if (isNaN(this.embouchureAcousticX)) {
            console.error("Calculation failed: Embouchure correction is NaN.");
            return false;
        }

        // 5. Calculate physical positions relative to the open end
        // Physical Distance = Acoustic End Position - Acoustic Position of Hole/Embouchure
        if (isNaN(this.acousticEndX)) {
            console.error("Calculation failed: Cannot determine physical positions due to invalid Acoustic End Position.");
            return false;
        }
        this.embouchurePhysicalPosition = this.acousticEndX - this.embouchureAcousticX;
        for (let i = 0; i < this.HOLE_COUNT; i++) {
            this.holes[i].physicalPosition = this.acousticEndX - this.holes[i].acousticPosition;
            if (isNaN(this.holes[i].physicalPosition)) {
                console.error(`Calculation failed: Physical position for hole ${i + 1} is NaN.`);
                return false; // Stop if any calculation fails
            }
        }

        console.log("Calculations successful.");
        return true; // Indicate success
    }

    /**
     * Performs the full calculation pipeline: read inputs, calculate, display results.
     */
    calculateAllPositions() {
        if (this.readInputsFromForm()) { // Ensure inputs are valid first
            if (this.calculateHolePositions_Quadratic()) { // Proceed if calculation succeeds
                this.displayResultsInForm();
            } else {
                alert("Calculation failed. Check console for details and verify inputs.");
                this.clearResults();
            }
        } else {
            this.clearResults(); // Clear results if inputs are invalid
        }
    }

    /**
     * Displays the calculated physical positions in the output fields.
     */
    displayResultsInForm() {
        const format = (value) => isNaN(value) ? "Error" : value.toFixed(3);

        this.resultEmbouchureOutput.value = format(this.embouchurePhysicalPosition);
        this.resultEndOutput.value = "0.000"; // By definition

        for (let i = 0; i < this.HOLE_COUNT; i++) {
            if (this.holeResultOutputs[i]) {
                this.holeResultOutputs[i].value = format(this.holes[i]?.physicalPosition);
            }
        }
    }

    /** Clears all result output fields. */
    clearResults() {
        this.resultEmbouchureOutput.value = "";
        this.resultEndOutput.value = "0.000";
        this.holeResultOutputs.forEach(output => {
            if (output) output.value = "";
        });
    }
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // Add polyfill for Number.isNaN if needed for older browsers
    Number.isNaN = Number.isNaN || function (value) {
        return typeof value === 'number' && isNaN(value);
    }
    window.fluteCalculator = new FluteCalculator();
});
