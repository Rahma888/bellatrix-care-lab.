package de.labland.bellatrix.patient;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.os.Bundle;
import android.widget.Toast;

/** Opens the patient screen of Bellatrix Care Team and steps aside. */
public class Open extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent i = new Intent();
        i.setClassName("de.labland.bellatrix", "de.labland.bellatrix.PatientActivity");
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(i);
        } catch (ActivityNotFoundException | SecurityException e) {
            Toast.makeText(this, "Install Bellatrix Care Team first.", Toast.LENGTH_LONG).show();
        }
        finish();
    }
}
