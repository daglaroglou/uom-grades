// Apply release signing when keystore.properties exists (CI)
val keystorePropertiesFile = rootProject.file("keystore.properties")
if (keystorePropertiesFile.exists()) {
    val keystoreProperties = java.util.Properties()
    keystoreProperties.load(java.io.FileInputStream(keystorePropertiesFile))
    android.signingConfigs.create("release") {
        keyAlias = keystoreProperties["keyAlias"] as String
        keyPassword = keystoreProperties["password"] as String
        storeFile = file(keystoreProperties["storeFile"] as String)
        storePassword = keystoreProperties["password"] as String
    }
    android.buildTypes.getByName("release").signingConfig = android.signingConfigs.getByName("release")
}
