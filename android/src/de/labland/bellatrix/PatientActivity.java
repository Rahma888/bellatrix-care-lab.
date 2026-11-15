package de.labland.bellatrix;

/** The patient app: only the activities, started by the care team. */
public class PatientActivity extends WebActivity {
    @Override
    protected String page() { return "patient.html"; }
}
